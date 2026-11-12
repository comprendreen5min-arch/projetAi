import pytest
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.training_run import TrainingRun
from app.models.active_learning import ActiveLearningRound


@pytest.fixture
def al_dataset(db_session, tmp_path):
    """Creates a dataset with multiple features and partitions for active learning tests."""
    ds = Dataset(name="test_al_churn.csv", description="Dataset for Active Learning")
    db_session.add(ds)
    db_session.flush()

    storage_dir = tmp_path / str(ds.id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    df = pd.DataFrame({
        "customer_id": [f"C-{i:06d}" for i in range(1, 41)],
        "tenure": [1, 24, 2, 48] * 10,
        "monthly_charges": [400.0, 50.0, 380.0, 60.0] * 10,
        "contract": ["Monthly", "Two year", "Monthly", "One year"] * 10,
        "city": ["Casablanca", "Paris", "Casablanca", "Lyon"] * 10,
        "split": ["train"] * 24 + ["val"] * 8 + ["test"] * 8,
        "churned": ["yes", "no", "yes", "no"] * 10,
    })

    file_path = storage_dir / "v4.parquet"
    table = pa.Table.from_pandas(df)
    pq.write_table(table, file_path)

    v4 = DatasetVersion(
        dataset_id=ds.id,
        storage_path=str(file_path),
        version_hash="al_hash_v4",
        row_count=len(df),
        size_bytes=file_path.stat().st_size,
        schema_metadata={"columns": list(df.columns)},
    )
    db_session.add(v4)
    db_session.flush()

    ds.current_version_id = v4.id
    ds.baseline_version_id = v4.id

    # Add a candidate training run
    cand_run = TrainingRun(
        dataset_id=ds.id,
        version_id=v4.id,
        run_name="test-al-xgb-08",
        model_type="xgboost",
        status="done",
        tag="candidate",
        target_column="churned",
        positive_class="yes",
        threshold=0.42,
        metrics_val={"recall_yes": 0.88, "precision_yes": 0.65},
    )
    db_session.add(cand_run)
    db_session.commit()
    return ds


def test_active_learning_workflow(client: TestClient, db_session: Session, al_dataset: Dataset):
    ds_id = str(al_dataset.id)

    # 1. GET state
    res = client.get(f"/api/v1/active-learning/{ds_id}/state")
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["header"]["dataset_id"] == ds_id
    assert data["header"]["round_number"] == 2
    assert "test-al-xgb-08" in data["header"]["scored_by_model"]
    assert len(data["loop_steps"]) == 5
    assert len(data["rounds_history"]) >= 2
    assert len(data["strategies"]) == 5
    assert len(data["picks"]) > 0
    assert len(data["pool_points"]) > 0
    assert len(data["guardrails"]) >= 6

    # 2. PUT update settings
    update_payload = {
        "rows_this_round": 150,
        "strategy_counts": {
            "near_threshold": 60,
            "models_disagree": 40,
            "looks_wrong": 30,
            "weak_segments": 10,
            "random_control": 10,
        },
        "stop_rule": {
            "fixes_under_pct": 12,
            "recall_gain_under_pts": 2,
        },
    }
    res_up = client.put(f"/api/v1/active-learning/{ds_id}/settings", json=update_payload)
    assert res_up.status_code == 200
    data_up = res_up.json()
    assert data_up["header"]["budget_rows"] == 150
    assert data_up["stop_rule_fixes_pct"] == 12

    # 3. POST send to labeling
    res_send = client.post(
        f"/api/v1/active-learning/{ds_id}/send-to-labeling",
        json={"round_number": 2, "target_split": "train"},
    )
    assert res_send.status_code == 200
    send_data = res_send.json()
    assert send_data["success"] is True
    assert send_data["rows_enqueued"] > 0
    assert send_data["new_version_label"] == "v5"

