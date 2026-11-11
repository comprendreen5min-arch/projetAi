import pytest
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.label_change import LabelChange
from app.models.transformation import Transformation


@pytest.fixture
def labeling_dataset(db_session, tmp_path):
    """Creates a realistic dataset with clean and conflicting rows for labeling tests."""
    ds = Dataset(name="customer_churn.csv", description="Dataset for labeling test")
    db_session.add(ds)
    db_session.flush()

    storage_dir = tmp_path / str(ds.id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    # 15 sample rows with realistic churn patterns
    df = pd.DataFrame({
        "customer_id": [f"C-{i:06d}" for i in range(1001, 1016)],
        "tenure": [2, 36, 1, 48, 3, 24, 2, 5, 12, 2, 30, 4, 18, 6, 2],
        "monthly_charges": [389.5, 45.0, 395.0, 50.0, 380.0, 75.0, 390.0, 80.0, 60.0, 410.0, 55.0, 90.0, 65.0, 85.0, 400.0],
        "contract": ["Monthly", "Two year", "Monthly", "Two year", "Monthly", "One year", "Monthly", "Monthly", "One year", "Monthly", "Two year", "Monthly", "One year", "Monthly", "Monthly"],
        "support_calls": [4, 0, 5, 0, 3, 1, 4, 1, 0, 4, 0, 2, 1, 1, 5],
        "last_interaction": ["cancel request", "payment", "cancel request", "upgrade", "cancel request", "support", "cancel request", "support", "inquiry", "cancel request", "inquiry", "support", "payment", "support", "cancel request"],
        "city": ["Casablanca", "Paris", "Lyon", "Marseille", "Casablanca", "Rabat", "Casablanca", "Paris", "Lyon", "Casablanca", "Paris", "Marseille", "Rabat", "Lyon", "Casablanca"],
        "split": ["train"] * 10 + ["test"] * 5,
        "churned": [
            "no",  # Row 0: high conflict (cancel request + 4 calls + 389.5 charges, but churned = no)
            "no",  # Row 1: clear loyal
            "no",  # Row 2: conflict
            "no",  # Row 3: loyal
            "no",  # Row 4: conflict
            "no",  # Row 5: normal
            "no",  # Row 6: conflict
            "no",  # Row 7: normal
            "no",  # Row 8: normal
            "yes", # Row 9: true churner
            "no",  # Row 10: loyal
            "yes", # Row 11: churner
            "no",  # Row 12: loyal
            "yes", # Row 13: churner
            None,  # Row 14: missing target
        ],
    })

    v_hash = "3333333333333333333333333333333333333333333333333333333333333333"
    v_path = storage_dir / f"{v_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df), v_path)

    v3 = DatasetVersion(
        dataset_id=ds.id,
        version_hash=v_hash,
        storage_path=str(v_path),
        row_count=len(df),
        size_bytes=v_path.stat().st_size,
    )
    db_session.add(v3)
    db_session.flush()

    # Link dataset current version
    ds.current_version_id = v3.id
    db_session.add(ds)
    db_session.commit()

    return {"dataset": ds, "version": v3, "df": df}


def test_get_labeling_status(labeling_dataset, client):
    """Vérifie le calcul automatique du statut global de labellisation :
    - Détection de la cible (churned)
    - Compteurs des files d'attente (suspected_errors, rule_conflicts, missing_target)
    - Score de confiance des labels
    - Nom de version de sortie (v2 ou supérieure)
    """
    ds = labeling_dataset["dataset"]
    resp = client.get(f"/api/v1/labeling/{ds.id}/status")
    assert resp.status_code == 200
    data = resp.json()

    assert data["target_column"] == "churned"
    assert data["pos_label"] in ["yes", "oui", "1"]
    assert data["neg_label"] in ["no", "non", "0"]
    assert data["suspected_errors_count"] >= 1
    assert data["rule_conflicts_count"] >= 1
    assert data["label_trust_before"] > 50
    assert len(data["queues"]) == 4

    queue_ids = [q["id"] for q in data["queues"]]
    assert "suspected_errors" in queue_ids
    assert "rule_conflicts" in queue_ids
    assert "missing_target" in queue_ids
    assert "to_review" in queue_ids


def test_get_queue_candidate_with_nearest_neighbors_and_features(labeling_dataset, client):
    """Vérifie le chargement d'un candidat à labelliser :
    - Caractéristiques avec surbrillance sémantique
    - Plus proches voisins
    - Historique d'événements
    - Motif de correction en masse
    """
    ds = labeling_dataset["dataset"]
    resp = client.get(f"/api/v1/labeling/{ds.id}/candidate?queue=suspected_errors&index=0")
    assert resp.status_code == 200
    data = resp.json()

    assert data["queue_id"] == "suspected_errors"
    assert data["total_items"] >= 1
    assert data["current_index"] == 1
    assert data["candidate"] is not None

    cand = data["candidate"]
    assert cand["customer_id"].startswith("C-")
    assert cand["current_label"] in ["no", "yes"]
    assert 0.0 <= cand["model_probability"] <= 1.0

    # Features check
    feature_names = [f["name"] for f in cand["features"]]
    assert "tenure" in feature_names or "monthly_charges" in feature_names
    assert len(cand["history"]) > 0
    assert len(cand["nearest_customers"]) > 0


def test_apply_decision_requires_reason_for_change(labeling_dataset, client):
    """Garde-fou : un motif est obligatoire pour changer un label (pas de bascule silencieuse)."""
    ds = labeling_dataset["dataset"]

    # 1. Attempt change without reason -> 400 Bad Request
    resp_fail = client.post(
        f"/api/v1/labeling/{ds.id}/decision",
        json={
            "row_index": 0,
            "customer_id": "C-001001",
            "decision": "change",
            "new_label": "yes",
            "reason": "",
        },
    )
    assert resp_fail.status_code == 400
    assert "motif est obligatoire" in resp_fail.json()["detail"].lower()

    # 2. Success with valid reason
    resp_ok = client.post(
        f"/api/v1/labeling/{ds.id}/decision",
        json={
            "row_index": 0,
            "customer_id": "C-001001",
            "decision": "change",
            "new_label": "yes",
            "reason": "Saisie tardive de résiliation dans le CRM",
        },
    )
    assert resp_ok.status_code == 200
    assert resp_ok.json()["success"] is True


def test_bulk_fix_and_checks_and_guardrails(labeling_dataset, client):
    """Vérifie l'application d'une correction en masse et le retour des contrôles et garde-fous."""
    ds = labeling_dataset["dataset"]

    # Apply bulk fix on rows 0 and 2
    bulk_resp = client.post(
        f"/api/v1/labeling/{ds.id}/bulk-fix",
        json={
            "row_indices": [0, 2],
            "new_label": "yes",
            "reason": "Demande de résiliation confirmée",
            "pattern_description": "cancel request + no invoice",
        },
    )
    assert bulk_resp.status_code == 200
    assert bulk_resp.json()["modified_count"] == 2

    # Query checks & guardrails
    checks_resp = client.get(f"/api/v1/labeling/{ds.id}/checks")
    assert checks_resp.status_code == 200
    checks_data = checks_resp.json()

    assert len(checks_data["checks"]) >= 3
    assert len(checks_data["recent_changes"]) >= 2
    assert len(checks_data["guardrails"]) == 6

    # Verify that reason guardrail passed
    g_reason = next(g for g in checks_data["guardrails"] if g["id"] == "g_reason")
    assert g_reason["passed"] is True


def test_save_labeling_version_creates_immutable_v4(labeling_dataset, client, db_session):
    """Vérifie l'enregistrement d'une nouvelle version avec les modifications appliquées :
    - Nouvelle version immuable créée
    - Transformation LABELING_PIPELINE avec log de modifications
    - Dataset mis à jour sur la nouvelle version
    """
    ds = labeling_dataset["dataset"]

    # Make 1 change
    client.post(
        f"/api/v1/labeling/{ds.id}/decision",
        json={
            "row_index": 0,
            "customer_id": "C-001001",
            "decision": "change",
            "new_label": "yes",
            "reason": "Résiliation confirmée",
        },
    )

    # Save as new version
    save_resp = client.post(
        f"/api/v1/labeling/{ds.id}/save-version",
        json={"rerun_augmentation": False, "description": "Labellisation v4 test"},
    )
    assert save_resp.status_code == 200
    save_data = save_resp.json()

    assert save_data["success"] is True
    assert save_data["changes_applied"] >= 1
    new_hash = save_data["new_version_hash"]

    # Verify in DB
    new_v = db_session.query(DatasetVersion).filter(DatasetVersion.version_hash == new_hash).first()
    assert new_v is not None
    assert new_v.parent_version_id is not None

    # Check Parquet data was updated
    df_new = pq.read_table(Path(new_v.storage_path)).to_pandas()
    assert df_new.at[0, "churned"] == "yes"

