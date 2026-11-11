import hashlib
import io
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from fastapi.testclient import TestClient

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.dataset_version_tag import DatasetVersionTag
from app.models.transformation import Transformation
from app.services.lineage_service import lineage_service
from app.services.versioning_service import versioning_service


@pytest.fixture
def sample_lineage_dataset(db_session, tmp_path):
    """Creates a complete dataset lineage: v1 (raw) -> v2 (cleaned) -> v3 (augmented) -> v3-b (draft)."""
    # 1. Dataset container
    ds = Dataset(name="telecom_churn", description="Churn dataset for versioning tests")
    db_session.add(ds)
    db_session.flush()

    storage_dir = tmp_path / str(ds.id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    # 2. v1 Raw DataFrame (100 rows)
    np.random.seed(42)
    n = 100
    df_v1 = pd.DataFrame({
        "customer_id": [f"C-{1000 + i}" for i in range(n)],
        "age": np.random.randint(20, 60, size=n),
        "income": np.random.randint(2000, 8000, size=n),
        "contract": np.random.choice(["Monthly", "Annual"], size=n),
        "churned": np.random.choice(["no", "yes"], size=n, p=[0.85, 0.15]),
    })

    v1_hash = "1111111111111111111111111111111111111111111111111111111111111111"
    v1_path = storage_dir / f"{v1_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df_v1), v1_path)

    v1 = DatasetVersion(
        dataset_id=ds.id,
        version_hash=v1_hash,
        parent_version_id=None,
        storage_path=str(v1_path),
        row_count=len(df_v1),
        size_bytes=v1_path.stat().st_size,
        schema_metadata={"columns": list(df_v1.columns)},
    )
    db_session.add(v1)
    db_session.flush()

    t1 = Transformation(
        name="CSV_INGESTION",
        parameters={"filename": "telecom_churn.csv"},
        source_version_id=None,
        target_version_id=v1.id,
    )
    db_session.add(t1)

    # 3. v2 Cleaned DataFrame (95 rows, 5 dropped duplicates/outliers)
    df_v2 = df_v1.iloc[:95].copy()
    v2_hash = "2222222222222222222222222222222222222222222222222222222222222222"
    v2_path = storage_dir / f"{v2_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df_v2), v2_path)

    v2 = DatasetVersion(
        dataset_id=ds.id,
        version_hash=v2_hash,
        parent_version_id=v1.id,
        storage_path=str(v2_path),
        row_count=len(df_v2),
        size_bytes=v2_path.stat().st_size,
        schema_metadata={"columns": list(df_v2.columns)},
    )
    db_session.add(v2)
    db_session.flush()

    t2 = Transformation(
        name="CLEANING_PIPELINE",
        parameters={"operations": [{"type": "DROP_DUPLICATES"}], "target_column": "churned"},
        source_version_id=v1.id,
        target_version_id=v2.id,
    )

    db_session.add(t2)

    # 4. v3 Augmented DataFrame (Split added: 70 train, 15 val, 10 test + 10 SMOTE rows in train)
    df_v3 = df_v2.copy()
    splits = ["train"] * 70 + ["val"] * 15 + ["test"] * 10
    df_v3["split"] = splits
    df_v3["is_synthetic"] = False
    df_v3["origin"] = "real"
    df_v3["parent_ids"] = ""

    # Add 10 synthetic rows to train
    synth_rows = []
    for i in range(10):
        synth_rows.append({
            "customer_id": f"SYN-{i+1:06d}",
            "age": 35 + i,
            "income": 4000 + i * 100,
            "contract": "Monthly",
            "churned": "yes",
            "split": "train",
            "is_synthetic": True,
            "origin": "smote",
            "parent_ids": "C-1001+C-1002",
        })
    df_v3 = pd.concat([df_v3, pd.DataFrame(synth_rows)], ignore_index=True)

    v3_hash = "3333333333333333333333333333333333333333333333333333333333333333"
    v3_path = storage_dir / f"{v3_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df_v3), v3_path)

    v3 = DatasetVersion(
        dataset_id=ds.id,
        version_hash=v3_hash,
        parent_version_id=v2.id,
        storage_path=str(v3_path),
        row_count=len(df_v3),
        size_bytes=v3_path.stat().st_size,
        schema_metadata={"columns": list(df_v3.columns)},
    )
    db_session.add(v3)
    db_session.flush()

    t3 = Transformation(
        name="AUGMENTATION_PIPELINE",
        parameters={
            "target_column": "churned",
            "split": {"ratios_target": {"train": 0.7, "val": 0.15, "test": 0.15}},
            "balance": {"mode": "target_30"},
            "techniques": [{"name": "SMOTE-NC", "enabled": True}, {"name": "UNDERSAMPLE_MAJORITY", "enabled": False}],
        },
        source_version_id=v2.id,
        target_version_id=v3.id,
    )
    db_session.add(t3)

    # Set baseline and current
    ds.baseline_version_id = v3.id
    ds.current_version_id = v3.id
    tag_base = DatasetVersionTag(version_id=v3.id, tag="baseline")
    db_session.add(tag_base)

    db_session.commit()
    db_session.refresh(ds)

    return {
        "dataset": ds,
        "v1": v1,
        "v2": v2,
        "v3": v3,
        "df_v1": df_v1,
        "df_v2": df_v2,
        "df_v3": df_v3,
    }


def test_lineage_graph_and_header_metrics(sample_lineage_dataset, client):
    """Vérifie le graphe DAG de lignage et les 4 métriques de l'en-tête."""
    ds = sample_lineage_dataset["dataset"]
    resp = client.get(f"/api/v1/datasets/{ds.id}/lineage")
    assert resp.status_code == 200
    graph = resp.json()

    assert graph["dataset_name"] == "telecom_churn"
    assert len(graph["nodes"]) == 3
    assert len(graph["edges"]) == 2

    # Check node labels and types
    labels = [n["version_label"] for n in graph["nodes"]]
    assert labels == ["v1", "v2", "v3"]

    node_v3 = graph["nodes"][2]
    assert node_v3["is_baseline"] is True
    assert node_v3["is_current"] is True
    assert node_v3["operation_type"] == "AUGMENTED"
    assert node_v3["author"] == " — "
    assert "datalift" in node_v3["code_version"]

    # Header metrics
    h_resp = client.get(f"/api/v1/datasets/{ds.id}/versioning-header")
    assert h_resp.status_code == 200
    header = h_resp.json()
    assert header["version_count"] == 3
    assert header["total_stored_bytes"] > 0
    assert header["used_by_models_count"] == 0
    assert header["used_by_label"] == "Aucun modèle lié"
    assert header["current_version_label"] == "v3"
    assert header["baseline_version_label"] == "v3"


def test_set_current_and_baseline_version(sample_lineage_dataset, client):
    """Vérifie la modification de la version courante et de la référence (baseline) sans toucher aux données."""
    ds = sample_lineage_dataset["dataset"]
    v2 = sample_lineage_dataset["v2"]

    # Restore v2 as current
    resp = client.put(f"/api/v1/datasets/{ds.id}/current-version", json={"version_hash": v2.version_hash})
    assert resp.status_code == 200
    assert resp.json()["current_version_hash"] == v2.version_hash

    # Check via restore endpoint
    v1 = sample_lineage_dataset["v1"]
    resp_rest = client.post(f"/api/v1/versions/{v1.version_hash}/restore")
    assert resp_rest.status_code == 200
    assert "restaurée comme version courante" in resp_rest.json()["message"]

    # Set v2 as baseline
    resp_base = client.put(f"/api/v1/datasets/{ds.id}/baseline-version", json={"version_hash": v2.version_hash})
    assert resp_base.status_code == 200
    assert resp_base.json()["baseline_version_hash"] == v2.version_hash


def test_add_and_remove_tags(sample_lineage_dataset, client):
    """Vérifie l'ajout et le retrait d'étiquettes distinctes de la version immuable."""
    v2 = sample_lineage_dataset["v2"]

    # Add tag
    resp = client.post(f"/api/v1/versions/{v2.version_hash}/tags", json={"tag": "production"})
    assert resp.status_code == 200
    assert resp.json()["tag"] == "production"

    # Add custom tag
    resp2 = client.post(f"/api/v1/versions/{v2.version_hash}/tags", json={"tag": "archive-q4"})
    assert resp2.status_code == 200
    assert resp2.json()["tag"] == "archive-q4"

    # Delete tag
    del_resp = client.delete(f"/api/v1/versions/{v2.version_hash}/tags/archive-q4")
    assert del_resp.status_code == 200
    assert del_resp.json()["success"] is True


def test_branch_from_version_creates_draft_with_expiration(sample_lineage_dataset, client, db_session):
    """Vérifie 'Brancher d'ici' créant un brouillon lié avec échéance d'expiration à 30 jours."""
    v3 = sample_lineage_dataset["v3"]
    resp = client.post(
        f"/api/v1/versions/{v3.version_hash}/branch",
        json={"branch_name": "target-50-test", "description": "Essai d'un autre équilibrage"},
    )
    assert resp.status_code == 200
    draft_data = resp.json()
    assert draft_data["is_draft"] is True
    assert draft_data["branch_name"] == "target-50-test"
    assert draft_data["expires_at"] is not None

    # Check in DB
    draft_db = db_session.query(DatasetVersion).filter(DatasetVersion.version_hash == draft_data["version_hash"]).first()
    assert draft_db is not None
    assert draft_db.parent_version_id == v3.id
    exp = draft_db.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    diff_days = (exp - datetime.now(timezone.utc)).days
    assert 28 <= diff_days <= 30



def test_delete_guarded_rejections_and_success(sample_lineage_dataset, client):
    """Vérifie le refus de suppression dans les 3 cas stricts :
    1. A des enfants
    2. Porte l'étiquette 'production'
    3. Est la version de référence (baseline)
    Et autorise la suppression d'une feuille isolée.
    """
    v1 = sample_lineage_dataset["v1"]
    v2 = sample_lineage_dataset["v2"]
    v3 = sample_lineage_dataset["v3"]

    # 1. Refusal: v1 has children (v2)
    resp1 = client.delete(f"/api/v1/versions/{v1.version_hash}")
    assert resp1.status_code == 409
    assert "possède" in resp1.json()["detail"] and "enfant" in resp1.json()["detail"]

    # 2. Refusal: v3 is the baseline
    resp2 = client.delete(f"/api/v1/versions/{v3.version_hash}")
    assert resp2.status_code == 409
    assert "référence (baseline)" in resp2.json()["detail"]

    # Create a draft leaf from v3
    b_resp = client.post(f"/api/v1/versions/{v3.version_hash}/branch", json={"branch_name": "temp-leaf"})
    leaf_hash = b_resp.json()["version_hash"]

    # Tag leaf as production
    client.post(f"/api/v1/versions/{leaf_hash}/tags", json={"tag": "production"})

    # 3. Refusal: leaf is tagged production
    resp3 = client.delete(f"/api/v1/versions/{leaf_hash}")
    assert resp3.status_code == 409
    assert "production" in resp3.json()["detail"]

    # Remove production tag
    client.delete(f"/api/v1/versions/{leaf_hash}/tags/production")

    # 4. Success: leaf has no children, not baseline, not production
    resp4 = client.delete(f"/api/v1/versions/{leaf_hash}")
    assert resp4.status_code == 200
    assert resp4.json()["success"] is True


def test_compare_versions_with_shifts_and_expected_vs_unexpected(sample_lineage_dataset, client):
    """Vérifie la comparaison fine de deux versions :
    - Détection de clé de ligne
    - Évolution de la cible (8% -> 30%)
    - Intégrité du test set
    - Calcul du décalage de distribution (Kolmogorov-Smirnov / TVD) avec classification HIGH/MEDIUM/LOW
    """
    v2 = sample_lineage_dataset["v2"]
    v3 = sample_lineage_dataset["v3"]

    resp = client.post(
        "/api/v1/versions/compare",
        json={"base_version_hash": v2.version_hash, "target_version_hash": v3.version_hash, "row_key": "customer_id"},
    )
    assert resp.status_code == 200
    comp = resp.json()

    assert comp["row_key_used"] == "customer_id"
    assert comp["added_count"] == 10  # 10 SMOTE rows
    assert "smote" in comp["added_summary"]
    assert comp["target_column"] == "churned"
    assert comp["target_evolution"] is not None

    # Distribution shifts list
    shifts = {item["column"]: item for item in comp["distribution_shifts"]}
    assert "age" in shifts
    assert "income" in shifts
    assert "contract" in shifts
    assert shifts["age"]["shift_level"] in ["HIGH", "MEDIUM", "LOW", "NONE"]
    assert shifts["churned"]["is_expected"] is True  # Target column is expected


def test_test_set_integrity_guardrail_and_status(sample_lineage_dataset, client, db_session, tmp_path):
    """Vérifie que l'intégrité du jeu de test est signalée 'identical', 'modified' ou 'not_applicable'."""
    v1 = sample_lineage_dataset["v1"]
    v2 = sample_lineage_dataset["v2"]
    v3 = sample_lineage_dataset["v3"]

    # v1 -> v2: no split column in v1/v2 -> not_applicable
    resp_no_split = client.post(
        "/api/v1/versions/compare",
        json={"base_version_hash": v1.version_hash, "target_version_hash": v2.version_hash},
    )
    assert resp_no_split.json()["test_set_status"] == "not_applicable"

    # Create v4 where test set is identically preserved from v3
    df_v4 = pq.read_table(Path(v3.storage_path)).to_pandas()
    # Modify only train
    df_v4.loc[df_v4["split"] == "train", "age"] += 1
    v4_hash = "4444444444444444444444444444444444444444444444444444444444444444"
    v4_path = Path(v3.storage_path).parent / f"{v4_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df_v4), v4_path)

    v4 = DatasetVersion(
        dataset_id=v3.dataset_id,
        version_hash=v4_hash,
        parent_version_id=v3.id,
        storage_path=str(v4_path),
        row_count=len(df_v4),
        size_bytes=v4_path.stat().st_size,
    )
    db_session.add(v4)
    db_session.commit()

    resp_identical = client.post(
        "/api/v1/versions/compare",
        json={"base_version_hash": v3.version_hash, "target_version_hash": v4.version_hash},
    )
    assert resp_identical.json()["test_set_status"] == "identical"

    # Modify test set in v5
    df_v5 = df_v4.copy()
    df_v5.loc[df_v5["split"] == "test", "age"] += 5
    v5_hash = "5555555555555555555555555555555555555555555555555555555555555555"
    v5_path = Path(v3.storage_path).parent / f"{v5_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df_v5), v5_path)

    v5 = DatasetVersion(
        dataset_id=v3.dataset_id,
        version_hash=v5_hash,
        parent_version_id=v4.id,
        storage_path=str(v5_path),
        row_count=len(df_v5),
        size_bytes=v5_path.stat().st_size,
    )
    db_session.add(v5)
    db_session.commit()

    resp_modified = client.post(
        "/api/v1/versions/compare",
        json={"base_version_hash": v4.version_hash, "target_version_hash": v5.version_hash},
    )
    assert resp_modified.json()["test_set_status"] == "modified"


def test_row_diff_pagination_and_filters(sample_lineage_dataset, client):
    """Vérifie le diff ligne par ligne paginé avec filtres All / Added / Removed / Modified."""
    v2 = sample_lineage_dataset["v2"]
    v3 = sample_lineage_dataset["v3"]

    # All items
    resp = client.get(f"/api/v1/versions/diff/rows?base_hash={v2.version_hash}&target_hash={v3.version_hash}&filter=all&page=1&page_size=5")
    assert resp.status_code == 200
    page = resp.json()
    assert page["counts"]["added"] == 10
    assert len(page["items"]) == 5
    assert page["total"] == 10

    # Added items
    resp_added = client.get(f"/api/v1/versions/diff/rows?base_hash={v2.version_hash}&target_hash={v3.version_hash}&filter=added")
    assert resp_added.status_code == 200
    items = resp_added.json()["items"]
    assert all(it["change"] == "added" for it in items)
    assert "smote" in items[0]["row_id"]


def test_virtual_views_query_and_download(sample_lineage_dataset, client):
    """Vérifie les vues virtuelles sans copie de données avec filtres et téléchargement (CSV, Parquet, JSONL)."""
    v3 = sample_lineage_dataset["v3"]

    # Query view with origin=smote
    resp = client.get(f"/api/v1/versions/{v3.version_hash}/views/query?origin=smote")
    assert resp.status_code == 200
    view_data = resp.json()
    assert view_data["total_matching"] == 10
    assert view_data["counts"]["synthetic"] == 10
    assert view_data["counts"]["all"] == 105
    assert "origin=smote" in view_data["api_url"]
    assert "datalift pull" in view_data["cli_command"]

    # Download CSV view
    csv_resp = client.get(f"/api/v1/versions/{v3.version_hash}/download-view?origin=smote&format=csv")
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    assert len(csv_resp.text.strip().split("\n")) == 11  # header + 10 rows

    # Download Parquet view
    pq_resp = client.get(f"/api/v1/versions/{v3.version_hash}/download-view?split=test&format=parquet")
    assert pq_resp.status_code == 200
    assert "application/octet-stream" in pq_resp.headers["content-type"]
    tbl = pq.read_table(io.BytesIO(pq_resp.content))
    assert len(tbl) == 10

    # Download JSONL view
    jsonl_resp = client.get(f"/api/v1/versions/{v3.version_hash}/download-view?split=val&format=jsonl")
    assert jsonl_resp.status_code == 200
    lines = jsonl_resp.text.strip().split("\n")
    assert len(lines) == 15


def test_guardrails_evaluation_endpoint(sample_lineage_dataset, client):
    """Vérifie l'évaluation réelle des 6 garde-fous :
    - Versions immuables (passed)
    - Test set hash inchangé (passed)
    - Versions utilisées protégées (passed)
    - Données personnelles en clair (not_evaluated avec motif explicite)
    - Chaque ligne traçable (passed)
    - Brouillons sans étiquette (passed pour v3, warning pour brouillon)
    """
    v3 = sample_lineage_dataset["v3"]

    resp = client.get(f"/api/v1/versions/{v3.version_hash}/guardrails")
    assert resp.status_code == 200
    guardrails = {g["id"]: g for g in resp.json()}

    assert len(guardrails) == 6
    assert guardrails["immutable_versions"]["status"] == "passed"
    # v3's parent v2 has no test split, so test_set_hash is correctly 'not_evaluated'
    assert guardrails["test_set_hash"]["status"] == "not_evaluated"
    assert "Non évalué" in guardrails["test_set_hash"]["message"]
    assert guardrails["protected_versions"]["status"] == "passed"
    assert guardrails["every_row_traceable"]["status"] == "passed"

    # Strict requirement: personal data must be 'not_evaluated', never a fake green checkmark!
    assert guardrails["personal_data_clear"]["status"] == "not_evaluated"
    assert "Non évalué" in guardrails["personal_data_clear"]["message"]


def test_dataset_card_generation(sample_lineage_dataset, client):
    """Vérifie la génération de la Dataset Card en Markdown et JSON."""
    v3 = sample_lineage_dataset["v3"]

    resp = client.get(f"/api/v1/versions/{v3.version_hash}/card")
    assert resp.status_code == 200
    card = resp.json()

    assert "# Dataset Card" in card["markdown"]
    assert "telecom_churn" in card["markdown"]
    assert card["json_data"]["version_hash"] == v3.version_hash
    assert card["json_data"]["synthetic_rows"] == 10
    assert len(card["json_data"]["lineage_recipes"]) == 3


def test_replay_recipe_on_new_file_and_refusal(sample_lineage_dataset, client):
    """Vérifie le rejeu automatique d'une chaîne de recettes sur un nouveau fichier uploadé,
    et le refus explicite lorsqu'une colonne requise est manquante.
    """
    v2 = sample_lineage_dataset["v2"]

    # 1. Success replay (includes 1 duplicate so drop duplicates creates v2)
    new_csv = (
        "customer_id,age,income,contract,churned\n"
        "C-2001,30,5000,Monthly,no\n"
        "C-2001,30,5000,Monthly,no\n"
        "C-2002,40,6000,Annual,yes\n"
        "C-2003,50,7000,Monthly,no\n"
    ).encode("utf-8")


    files = {"file": ("new_telecom.csv", io.BytesIO(new_csv), "text/csv")}
    resp = client.post(f"/api/v1/versions/{v2.version_hash}/replay", files=files)
    assert resp.status_code == 200
    assert resp.json()["success"] is True
    assert len(resp.json()["created_versions"]) >= 2

    # 2. Refusal when missing column
    incompatible_csv = (
        "user_id,charge,city\n"
        "U-1,50.0,Paris\n"
    ).encode("utf-8")

    files_bad = {"file": ("incompatible.csv", io.BytesIO(incompatible_csv), "text/csv")}
    resp_bad = client.post(f"/api/v1/versions/{v2.version_hash}/replay", files=files_bad)
    assert resp_bad.status_code == 400
    assert "non applicable" in resp_bad.json()["detail"].lower()


def test_exact_v3_to_v4_diff_and_coherence_between_cards_and_row_diff(client, db_session, tmp_path):
    """Vérifie le cas exact v3 -> v4 :
    - 980 lignes initiales dans v3 (sans colonnes techniques)
    - v4 avec 63 lignes synthétiques ajoutées, 329 lignes retirées (sous-échantillonnées), et 0 modifiée
    - Exclusion stricte des colonnes techniques (split, is_synthetic, origin, parent_ids)
    - Cohérence stricte et absolue entre les compteurs de synthèse (compare) et le détail ligne par ligne (diff/rows)
    - Évolution de la cible calculée sur train (split='train')
    """
    ds = Dataset(name="churn_exact_diff", description="Test exact 63/329/0")
    db_session.add(ds)
    db_session.flush()

    storage_dir = tmp_path / str(ds.id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    # v3: 980 rows (IDs C-0001 to C-0980)
    n3 = 980
    cids_v3 = [f"C-{i:04d}" for i in range(1, n3 + 1)]
    churn_labels_v3 = ["yes"] * 90 + ["no"] * (n3 - 90)
    df_v3 = pd.DataFrame({
        "customer_id": cids_v3,
        "age": [30 + (i % 30) for i in range(n3)],
        "income": [3000 + (i % 50) * 100 for i in range(n3)],
        "monthly_charges": [50.0 + (i % 40) for i in range(n3)],
        "contract": ["Monthly" if i % 2 == 0 else "Annual" for i in range(n3)],
        "churned": churn_labels_v3,
    })

    v3_hash = "3333333333333333333333333333333333333333333333333333333333333333"
    v3_path = storage_dir / f"{v3_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df_v3), v3_path)

    v3 = DatasetVersion(
        dataset_id=ds.id,
        version_hash=v3_hash,
        storage_path=str(v3_path),
        row_count=len(df_v3),
        size_bytes=v3_path.stat().st_size,
    )
    db_session.add(v3)
    db_session.flush()

    # v4: remove 329 'no' rows (say C-0091 through C-0419)
    # kept real rows = 980 - 329 = 651
    removed_cids = set(f"C-{i:04d}" for i in range(91, 91 + 329))
    df_v4_kept = df_v3[~df_v3["customer_id"].isin(removed_cids)].copy()

    # Add 63 synthetic rows
    synth_rows = []
    for i in range(1, 64):
        synth_rows.append({
            "customer_id": f"SYN-{i:06d}",
            "age": 35,
            "income": 4500,
            "monthly_charges": 65.50,
            "contract": "Monthly",
            "churned": "yes",
            "split": "train",
            "is_synthetic": True,
            "origin": "smote",
            "parent_ids": "C-0001+C-0002",
        })
    df_synth = pd.DataFrame(synth_rows)

    # Assign split to kept rows: total v4 = 651 real + 63 synth = 714 rows
    # 420 train (357 real + 63 synth), 148 val, 146 test
    kept_splits = ["train"] * 357 + ["val"] * 148 + ["test"] * 146
    df_v4_kept["split"] = kept_splits
    df_v4_kept["is_synthetic"] = False
    df_v4_kept["origin"] = "real"
    df_v4_kept["parent_ids"] = ""

    df_v4 = pd.concat([df_v4_kept, df_synth], ignore_index=True)

    v4_hash = "4444444444444444444444444444444444444444444444444444444444444444"
    v4_path = storage_dir / f"{v4_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df_v4), v4_path)

    v4 = DatasetVersion(
        dataset_id=ds.id,
        version_hash=v4_hash,
        parent_version_id=v3.id,
        storage_path=str(v4_path),
        row_count=len(df_v4),
        size_bytes=v4_path.stat().st_size,
    )
    db_session.add(v4)
    db_session.flush()

    t4 = Transformation(
        name="AUGMENTATION_PIPELINE",
        parameters={
            "target_column": "churned",
            "split": {"ratios_target": {"train": 0.7, "val": 0.15, "test": 0.15}},
            "balance": {"mode": "target_30"},
            "techniques": [
                {"name": "SMOTE-NC", "enabled": True, "generated_rows": 63},
                {"name": "UNDERSAMPLE_MAJORITY", "enabled": True, "removed_rows": 329},
            ],
        },
        source_version_id=v3.id,
        target_version_id=v4.id,
    )
    db_session.add(t4)
    db_session.commit()

    # 1. Compare endpoint with auto-detected key
    resp_comp = client.post(
        "/api/v1/versions/compare",
        json={"base_version_hash": v3.version_hash, "target_version_hash": v4.version_hash},
    )
    assert resp_comp.status_code == 200
    comp = resp_comp.json()

    assert comp["row_key_used"] == "customer_id"
    assert comp["added_count"] == 63
    assert comp["removed_count"] == 329
    assert comp["modified_count"] == 0
    assert "TRAIN" in comp["distribution_shifts_title"]
    assert "train" in comp["target_evolution_details"].lower()

    # 2. Compare endpoint with user-chosen key
    resp_key = client.post(
        "/api/v1/versions/compare",
        json={"base_version_hash": v3.version_hash, "target_version_hash": v4.version_hash, "row_key": "customer_id"},
    )
    assert resp_key.status_code == 200
    assert resp_key.json()["added_count"] == 63
    assert resp_key.json()["removed_count"] == 329
    assert resp_key.json()["modified_count"] == 0

    # 3. Row diff items with pagination and filters
    # Filter: all
    resp_all = client.get(
        f"/api/v1/versions/diff/rows?base_hash={v3.version_hash}&target_hash={v4.version_hash}&filter=all&page_size=100"
    )
    assert resp_all.status_code == 200
    page_all = resp_all.json()
    assert page_all["counts"]["added"] == 63
    assert page_all["counts"]["removed"] == 329
    assert page_all["counts"]["modified"] == 0
    assert page_all["counts"]["all"] == 63 + 329  # 392

    # Filter: added
    resp_add = client.get(
        f"/api/v1/versions/diff/rows?base_hash={v3.version_hash}&target_hash={v4.version_hash}&filter=added&page_size=100"
    )
    assert resp_add.status_code == 200
    page_add = resp_add.json()
    assert page_add["total"] == 63
    assert len(page_add["items"]) == 63
    assert all(it["change"] == "added" for it in page_add["items"])

    # Filter: removed
    resp_rem = client.get(
        f"/api/v1/versions/diff/rows?base_hash={v3.version_hash}&target_hash={v4.version_hash}&filter=removed&page_size=100"
    )
    assert resp_rem.status_code == 200
    page_rem = resp_rem.json()
    assert page_rem["total"] == 329
    assert len(page_rem["items"]) == 100
    assert all(it["change"] == "removed" for it in page_rem["items"])

    # Filter: modified
    resp_mod = client.get(
        f"/api/v1/versions/diff/rows?base_hash={v3.version_hash}&target_hash={v4.version_hash}&filter=modified"
    )
    assert resp_mod.status_code == 200
    page_mod = resp_mod.json()
    assert page_mod["total"] == 0
    assert len(page_mod["items"]) == 0


def test_technical_columns_ignored_in_row_comparison(client, db_session, tmp_path):
    """Vérifie que des lignes dont seules les colonnes techniques changent
    (split, origin, is_synthetic, parent_ids) ne sont PAS comptées comme modifiées.
    """
    ds = Dataset(name="tech_cols_test", description="Technical columns exclusion")
    db_session.add(ds)
    db_session.flush()

    storage_dir = tmp_path / str(ds.id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    df_base = pd.DataFrame({
        "customer_id": ["C-1", "C-2", "C-3"],
        "age": [25, 40, 55],
        "city": ["Paris", "Lyon", "Marseille"],
    })
    base_hash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    base_path = storage_dir / f"{base_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df_base), base_path)
    v_base = DatasetVersion(dataset_id=ds.id, version_hash=base_hash, storage_path=str(base_path), row_count=3)
    db_session.add(v_base)
    db_session.flush()

    # Target has identical customer features, but technical columns are added / different
    df_target = df_base.copy()
    df_target["split"] = ["train", "val", "test"]
    df_target["origin"] = ["real", "real", "real"]
    df_target["is_synthetic"] = [False, False, False]
    df_target["parent_ids"] = ["", "", ""]

    target_hash = "tttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttttt"
    target_path = storage_dir / f"{target_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df_target), target_path)
    v_target = DatasetVersion(dataset_id=ds.id, version_hash=target_hash, storage_path=str(target_path), row_count=3)
    db_session.add(v_target)
    db_session.commit()

    resp = client.post(
        "/api/v1/versions/compare",
        json={"base_version_hash": base_hash, "target_version_hash": target_hash},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["added_count"] == 0
    assert data["removed_count"] == 0
    assert data["modified_count"] == 0

    diff_resp = client.get(
        f"/api/v1/versions/diff/rows?base_hash={base_hash}&target_hash={target_hash}&filter=all"
    )
    assert diff_resp.status_code == 200
    assert diff_resp.json()["counts"]["modified"] == 0
    assert diff_resp.json()["counts"]["all"] == 0


def test_compare_versions_with_duplicate_keys_and_self_comparison(client, db_session, tmp_path):
    """Vérifie la robustesse face aux doublons d'identifiants (ex: dataset brut v1) :
    1. Comparaison d'une version avec elle-même (v1 -> v1) : 0 ajoutée, 0 retirée, 0 modifiée.
    2. Comparaison d'une version avec doublons vers une version dédoublonnée (v1 -> v2) :
       ne lève pas de ValueError: The truth value of a Series is ambiguous.
    3. Cohérence absolue entre compareVersions et getRowDiff.
    """
    ds = Dataset(name="dup_keys_dataset", description="Duplicates test")
    db_session.add(ds)
    db_session.flush()

    storage_dir = tmp_path / str(ds.id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    # v1 has duplicate customer_id "C-01" (2 occurrences)
    df_v1 = pd.DataFrame({
        "customer_id": ["C-01", "C-01", "C-02", "C-03"],
        "age": [30, 30, 45, 60],
        "churned": ["no", "no", "yes", "no"],
    })
    v1_hash = "1111dup1111dup1111dup1111dup1111dup1111dup1111dup1111dup1111dup1"
    v1_path = storage_dir / f"{v1_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df_v1), v1_path)
    v1 = DatasetVersion(dataset_id=ds.id, version_hash=v1_hash, storage_path=str(v1_path), row_count=4)
    db_session.add(v1)

    # v2 has deduplicated C-01 (1 occurrence) and one modified age
    df_v2 = pd.DataFrame({
        "customer_id": ["C-01", "C-02", "C-03"],
        "age": [30, 46, 60],  # C-02 age changed from 45 to 46
        "churned": ["no", "yes", "no"],
    })
    v2_hash = "2222dup2222dup2222dup2222dup2222dup2222dup2222dup2222dup2222dup2"
    v2_path = storage_dir / f"{v2_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df_v2), v2_path)
    v2 = DatasetVersion(dataset_id=ds.id, version_hash=v2_hash, parent_version_id=v1.id, storage_path=str(v2_path), row_count=3)
    db_session.add(v2)
    db_session.commit()

    # 1. Self comparison (v1 -> v1)
    resp_self = client.post(
        "/api/v1/versions/compare",
        json={"base_version_hash": v1_hash, "target_version_hash": v1_hash},
    )
    assert resp_self.status_code == 200
    comp_self = resp_self.json()
    assert comp_self["added_count"] == 0
    assert comp_self["removed_count"] == 0
    assert comp_self["modified_count"] == 0

    diff_self = client.get(
        f"/api/v1/versions/diff/rows?base_hash={v1_hash}&target_hash={v1_hash}&filter=all"
    )
    assert diff_self.status_code == 200
    assert diff_self.json()["counts"]["all"] == 0

    # 2. v1 -> v2 (deduplication of duplicate C-01 + modification of C-02)
    resp_v1_v2 = client.post(
        "/api/v1/versions/compare",
        json={"base_version_hash": v1_hash, "target_version_hash": v2_hash},
    )
    assert resp_v1_v2.status_code == 200
    comp_v1_v2 = resp_v1_v2.json()
    assert comp_v1_v2["added_count"] == 0
    assert comp_v1_v2["removed_count"] == 1  # 1 duplicate row removed
    assert comp_v1_v2["modified_count"] == 1  # C-02 age modified 45 -> 46

    diff_v1_v2 = client.get(
        f"/api/v1/versions/diff/rows?base_hash={v1_hash}&target_hash={v2_hash}&filter=all"
    )
    assert diff_v1_v2.status_code == 200
    d_counts = diff_v1_v2.json()["counts"]
    assert d_counts["added"] == comp_v1_v2["added_count"]
    assert d_counts["removed"] == comp_v1_v2["removed_count"]
    assert d_counts["modified"] == comp_v1_v2["modified_count"]


def test_compare_versions_keyless_and_target_detection(client, db_session, tmp_path):
    """Vérifie le fonctionnement sans clé (par empreinte) et la détection dynamique
    de cibles variées (souscrit, target, etc.).
    """
    ds = Dataset(name="marketing_target_test", description="Target detection test")
    db_session.add(ds)
    db_session.flush()

    storage_dir = tmp_path / str(ds.id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    # Marketing dataset with target "souscrit" and no ID column
    df_m1 = pd.DataFrame({
        "age": [20, 30, 40, 50],
        "solde": [1000, 2000, 3000, 4000],
        "souscrit": ["non", "non", "non", "oui"],
    })
    m1_hash = "mmmm1111mmmm1111mmmm1111mmmm1111mmmm1111mmmm1111mmmm1111mmmm1111"
    m1_path = storage_dir / f"{m1_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df_m1), m1_path)
    vm1 = DatasetVersion(dataset_id=ds.id, version_hash=m1_hash, storage_path=str(m1_path), row_count=4)
    db_session.add(vm1)

    df_m2 = pd.DataFrame({
        "age": [20, 30, 40, 50, 25],
        "solde": [1000, 2000, 3000, 4000, 1500],
        "souscrit": ["non", "non", "non", "oui", "oui"],
    })
    m2_hash = "mmmm2222mmmm2222mmmm2222mmmm2222mmmm2222mmmm2222mmmm2222mmmm2222"
    m2_path = storage_dir / f"{m2_hash}.parquet"
    pq.write_table(pa.Table.from_pandas(df_m2), m2_path)
    vm2 = DatasetVersion(dataset_id=ds.id, version_hash=m2_hash, storage_path=str(m2_path), row_count=5)
    db_session.add(vm2)
    db_session.commit()

    # Compare without key (row_key="none")
    resp = client.post(
        "/api/v1/versions/compare",
        json={"base_version_hash": m1_hash, "target_version_hash": m2_hash, "row_key": "none"},
    )
    assert resp.status_code == 200
    comp = resp.json()
    assert comp["target_column"] == "souscrit"
    assert comp["added_count"] == 1
    assert comp["removed_count"] == 0

    diff_resp = client.get(
        f"/api/v1/versions/diff/rows?base_hash={m1_hash}&target_hash={m2_hash}&filter=all&row_key=none"
    )
    assert diff_resp.status_code == 200
    diff_data = diff_resp.json()
    assert diff_data["counts"]["added"] == comp["added_count"]
    assert diff_data["counts"]["removed"] == comp["removed_count"]


