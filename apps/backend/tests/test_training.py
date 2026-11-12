import pytest
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.training_run import TrainingRun


@pytest.fixture
def training_dataset(db_session, tmp_path):
    """Creates a realistic dataset with train, val, and test splits for training tests."""
    ds = Dataset(name="customer_churn.csv", description="Dataset for training test")
    db_session.add(ds)
    db_session.flush()

    storage_dir = tmp_path / str(ds.id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    # 30 sample rows with train, val, and test
    df = pd.DataFrame({
        "customer_id": [f"C-{i:06d}" for i in range(1001, 1031)],
        "tenure": [2, 36, 1, 48, 3, 24, 2, 5, 12, 2] * 3,
        "monthly_charges": [389.5, 45.0, 395.0, 50.0, 380.0, 75.0, 390.0, 80.0, 60.0, 410.0] * 3,
        "contract": ["Monthly", "Two year", "Monthly", "Two year", "Monthly", "One year", "Monthly", "Monthly", "One year", "Monthly"] * 3,
        "support_calls": [4, 0, 5, 0, 3, 1, 4, 1, 0, 4] * 3,
        "cancel_date": ["2023-10-01", None, "2023-10-15", None, None, None, None, None, None, "2023-10-20"] * 3,
        "city": ["Casablanca", "Paris", "Lyon", "Marseille", "Casablanca", "Rabat", "Casablanca", "Paris", "Lyon", "Casablanca"] * 3,
        "split": ["train"] * 18 + ["val"] * 6 + ["test"] * 6,
        "churned": ["yes", "no", "yes", "no", "no", "no", "yes", "no", "no", "yes"] * 3,
    })

    file_path = storage_dir / "v1.parquet"
    table = pa.Table.from_pandas(df)
    pq.write_table(table, file_path)

    v1 = DatasetVersion(
        dataset_id=ds.id,
        storage_path=str(file_path),
        version_hash="mock_hash_v1",
        row_count=len(df),
        size_bytes=file_path.stat().st_size,
        schema_metadata={"columns": list(df.columns)},
    )
    db_session.add(v1)
    db_session.flush()

    ds.current_version_id = v1.id
    ds.baseline_version_id = v1.id
    db_session.commit()
    return ds


def test_training_workflow(client: TestClient, db_session: Session, training_dataset: Dataset):
    dataset = training_dataset

    # 1. Config & Pre-run checks (including leak column detection)
    resp = client.get(f"/api/v1/training/{dataset.id}/config")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "dataset_version" in data
    assert "checks" in data
    assert "features" in data
    assert data["checks"]["baseline_included"] is True
    # Verify cancel_date leak is detected
    assert "cancel_date" in data["checks"]["leak_columns_found"]

    # 2. Header metrics
    resp = client.get(f"/api/v1/training/{dataset.id}/header")
    assert resp.status_code == 200, resp.text
    header = resp.json()
    assert header["total_runs"] >= 6
    assert "candidate_run_number" in header
    assert len(header["guardrails"]) >= 8

    # 3. List runs & filters
    resp = client.get(f"/api/v1/training/{dataset.id}/runs")
    assert resp.status_code == 200, resp.text
    runs = resp.json()
    assert len(runs) >= 6

    # Test filter by status
    resp_running = client.get(f"/api/v1/training/{dataset.id}/runs?status=running")
    assert resp_running.status_code == 200
    running_runs = resp_running.json()
    assert all(r["status"] == "running" for r in running_runs)

    # 4. Run detail
    cand_run = next((r for r in runs if r["tag"] == "candidate"), runs[0])
    resp_detail = client.get(f"/api/v1/training/runs/{cand_run['id']}?split=val")
    assert resp_detail.status_code == 200, resp_detail.text
    detail = resp_detail.json()
    assert detail["recall_yes"] is not None
    assert detail["confusion_matrix"] is not None
    assert detail["threshold_cost"] is not None
    assert len(detail["feature_drivers"]) > 0
    assert len(detail["slices"]) > 0
    assert any(s["flag"] == "weak" for s in detail["slices"])

    # 5. Evaluate on locked test set
    resp_eval = client.post(f"/api/v1/training/runs/{cand_run['id']}/evaluate-test")
    assert resp_eval.status_code == 200, resp_eval.text
    eval_res = resp_eval.json()
    assert eval_res["success"] is True
    assert eval_res["test_eval_count"] >= 1

    # 6. Compare candidate and production
    resp_comp = client.get(f"/api/v1/training/{dataset.id}/compare")
    assert resp_comp.status_code == 200, resp_comp.text
    comp = resp_comp.json()
    assert comp["prod_run_name"] is not None
    assert comp["cand_run_name"] is not None
    assert len(comp["comparison_table"]) >= 5
    assert comp["checklist"]["beats_production"] is True

    # 7. Promote candidate to production
    resp_promote = client.post(f"/api/v1/training/runs/{cand_run['id']}/promote")
    assert resp_promote.status_code == 200, resp_promote.text
    promoted = db_session.query(TrainingRun).filter(TrainingRun.id == cand_run["id"]).first()
    assert promoted.tag == "production"

    # 8. Start a new run
    req_payload = {
        "dataset_version": "v1",
        "train_view": "Real + smote",
        "target_column": "churned",
        "positive_class": "yes",
        "optimize_metric": "recall_yes",
        "precision_constraint": 0.60,
        "models_to_try": ["XGBoost", "Logistic · baseline"],
        "search_method": "Bayesian",
        "trials": 5,
        "time_limit_minutes": 5,
        "seed": 42,
    }
    resp_start = client.post(f"/api/v1/training/{dataset.id}/runs", json=req_payload)
    assert resp_start.status_code == 200, resp_start.text
    start_data = resp_start.json()
    assert start_data["success"] is True
    assert "run_id" in start_data
