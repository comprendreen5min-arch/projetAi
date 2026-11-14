import pytest
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.api.v1.endpoints.text_drift import get_data, save_settings, run_check, adopt_reference, send_cluster_to_07

def test_text_drift_template_data():
    db: Session = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.name.ilike("%support_tickets%")).first()
        if not dataset:
            dataset = Dataset(name="support_tickets.jsonl")
            db.add(dataset)
            db.flush()
            v1 = DatasetVersion(dataset_id=dataset.id, version_hash="t_v1", row_count=5000, size_bytes=1000, storage_path="t1.parquet")
            v2 = DatasetVersion(dataset_id=dataset.id, version_hash="t_v2", row_count=5500, size_bytes=1000, storage_path="t2.parquet")
            v3 = DatasetVersion(dataset_id=dataset.id, version_hash="t_v3", row_count=6000, size_bytes=1000, storage_path="t3.parquet")
            db.add_all([v1, v2, v3])
            db.commit()

        data = get_data(str(dataset.id), db)
        assert data["alert_badge"]["count"] == "01"
        assert data["alert_badge"]["label"] == "NEW TOPIC"
        assert data["metrics"]["reference"] == "tickets@v3"
        assert len(data["signals"]) == 8
        assert len(data["data_quality"]["checks"]) == 6
        assert len(data["model_impact"]["segments"]) == 4
        assert len(data["what_to_do"]["cards"]) == 4
        assert len(data["guardrails"]) == 8

        # Test save settings
        save_res = save_settings(str(dataset.id), {"distance_watch": 0.15, "distance_drift": 0.30}, db)
        assert save_res["status"] == "success"

        # Test run check
        check_res = run_check(str(dataset.id), db)
        assert check_res["status"] == "success"

        # Test adopt reference
        ref_res = adopt_reference(str(dataset.id), {}, db)
        assert ref_res["status"] == "success"

        # Test send cluster to 07
        cluster_res = send_cluster_to_07(str(dataset.id), {"cluster_id": "cluster 23", "count": 148}, db)
        assert cluster_res["status"] == "success"
    finally:
        db.close()

def test_text_drift_dynamic_dataset():
    db: Session = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.name == "customer_reviews_nlp.parquet").first()
        if not dataset:
            dataset = Dataset(name="customer_reviews_nlp.parquet")
            db.add(dataset)
            db.flush()
            v1 = DatasetVersion(dataset_id=dataset.id, version_hash="rev_1", row_count=2000, size_bytes=1000, storage_path="rev1.parquet")
            db.add(v1)
            db.commit()

        data = get_data(str(dataset.id), db)
        assert data["dataset_name"] == "customer_reviews_nlp.parquet"
        assert "SHIFT DETECTED" in data["alert_badge"]["label"]
        assert len(data["signals"]) >= 4
        assert len(data["data_quality"]["checks"]) >= 4
    finally:
        db.close()

