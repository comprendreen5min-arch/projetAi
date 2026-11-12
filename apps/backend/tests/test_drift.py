import pytest
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.training_run import TrainingRun
from app.models.drift import DriftCheckRun


@pytest.fixture
def drift_test_dataset(db_session: Session, tmp_path):
    """Creates a dataset with numerical and categorical features for drift testing."""
    ds = Dataset(name="customer_churn.csv", description="Dataset for Drift testing")
    db_session.add(ds)
    db_session.flush()

    storage_dir = tmp_path / str(ds.id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    df = pd.DataFrame({
        "customer_id": [f"C-{i:06d}" for i in range(1, 51)],
        "tenure": [2, 12, 1, 36, 4] * 10,
        "monthly_charges": [450.0, 60.0, 520.0, 75.0, 390.0] * 10,
        "contract": ["monthly", "annual", "monthly", "two_year", "monthly"] * 10,
        "city": ["Casablanca", "Tanger", "Rabat", "Marrakech", "Tanger"] * 10,
        "split": ["train"] * 30 + ["val"] * 10 + ["test"] * 10,
        "churned": ["yes", "no", "yes", "no", "yes"] * 10,
    })

    file_path = storage_dir / "v4.parquet"
    table = pa.Table.from_pandas(df)
    pq.write_table(table, file_path)

    v4 = DatasetVersion(
        dataset_id=ds.id,
        storage_path=str(file_path),
        version_hash="drift_test_hash_v4",
        row_count=len(df),
        size_bytes=file_path.stat().st_size,
        schema_metadata={"columns": list(df.columns)},
    )
    db_session.add(v4)
    db_session.flush()

    ds.current_version_id = v4.id
    ds.baseline_version_id = v4.id

    # Add a production training run
    prod_run = TrainingRun(
        dataset_id=ds.id,
        version_id=v4.id,
        run_name="churn-xgb-07",
        model_type="xgboost",
        target_column="churned",
        positive_class="yes",
        status="done",
        tag="production",
        metrics_val={"recall": 0.82, "precision": 0.74},
        metrics_test={"recall": 0.80},
    )
    db_session.add(prod_run)
    db_session.commit()

    return ds


def test_get_drift_state(client: TestClient, drift_test_dataset: Dataset):
    """Verifies that GET /drift/{dataset_id}/state returns complete dynamic drift metrics."""
    response = client.get(f"/api/v1/drift/{drift_test_dataset.id}/state")
    assert response.status_code == 200
    data = response.json()

    # Header
    assert data["header"]["production_model_name"] == "churn-xgb-07"
    assert data["header"]["drifting_columns_count"] >= 1
    assert len(data["header"]["drifting_columns"]) >= 1

    # Timeline (30 days)
    assert len(data["timeline"]["points"]) >= 3
    assert data["timeline"]["drift_threshold"] == 0.25

    # Signals
    signals = data["signals"]
    assert len(signals) >= 4
    # Multivariate classifier is first
    assert signals[0]["signal"] == "all columns · together"
    assert signals[0]["kind"] == "multivariate"
    assert signals[0]["test"] == "Classifier"
    assert len(signals[0]["inspector"]["live_bars"]) > 0

    # Data Quality
    assert len(data["quality_checks"]) >= 5
    check_names = [c["check_type"] for c in data["quality_checks"]]
    assert "Missing values" in check_names
    assert "New category" in check_names
    assert "Out of range" in check_names
    assert "failed" in data["quality_summary"]
    assert "passed" in data["quality_summary"]

    # Model Impact
    assert data["model_impact"]["recall_yes_estimated"] > 0
    assert len(data["model_impact"]["segments"]) >= 2

    # Decisions
    assert len(data["decisions"]) == 4
    recommended = [d for d in data["decisions"] if d["is_recommended"]]
    assert len(recommended) == 1
    assert recommended[0]["action_type"] == "start_active_learning"

    # Thresholds & Guardrails
    assert data["thresholds"]["psi_watch"] == 0.10
    assert data["thresholds"]["psi_drift"] == 0.25
    assert len(data["guardrails"]) >= 6


def test_update_drift_settings(client: TestClient, drift_test_dataset: Dataset):
    """Tests updating thresholds and notification channels."""
    update_payload = {
        "psi_watch": 0.12,
        "psi_drift": 0.28,
        "window_days": 14,
        "min_rows": 600,
        "email_alerts": True,
        "slack_alerts": False,
    }
    response = client.put(f"/api/v1/drift/{drift_test_dataset.id}/settings", json=update_payload)
    assert response.status_code == 200
    data = response.json()

    assert data["thresholds"]["psi_watch"] == 0.12
    assert data["thresholds"]["psi_drift"] == 0.28
    assert data["thresholds"]["window_days"] == 14
    assert data["thresholds"]["min_rows"] == 600
    assert data["thresholds"]["slack_alerts"] is False


def test_run_drift_check_now(client: TestClient, drift_test_dataset: Dataset, db_session: Session):
    """Tests running an immediate live drift check and recording the run."""
    response = client.post(f"/api/v1/drift/{drift_test_dataset.id}/check-now")
    assert response.status_code == 200
    data = response.json()

    assert data["success"] is True
    assert data["drifting_columns_count"] >= 1
    assert "checked_at" in data

    # Verify run is persisted in DriftCheckRun table
    run_record = db_session.query(DriftCheckRun).filter(DriftCheckRun.dataset_id == drift_test_dataset.id).first()
    assert run_record is not None
    assert run_record.drifting_columns_count >= 1
