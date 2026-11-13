import pytest
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.api.v1.endpoints.image_active_learning import get_data, save_draft, send_to_labeling

def test_image_active_learning_template_data():
    db: Session = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.name.ilike("%product_defects%")).first()
        if not dataset:
            dataset = Dataset(name="product_defects")
            db.add(dataset)
            db.flush()
            v1 = DatasetVersion(dataset_id=dataset.id, version_hash="img_h1", row_count=12480, size_bytes=1000, storage_path="dummy.parquet")
            v2 = DatasetVersion(dataset_id=dataset.id, version_hash="img_h2", row_count=11838, size_bytes=1000, storage_path="dummy.parquet")
            v3 = DatasetVersion(dataset_id=dataset.id, version_hash="img_h3", row_count=8470, size_bytes=1000, storage_path="dummy.parquet")
            db.add_all([v1, v2, v3])
            db.commit()

        data = get_data(str(dataset.id), "all", db)
        assert data["round_badge"] == "03"
        assert data["round_state"] == "DRAFT"
        assert data["metrics"]["output"] == "v5"
        assert len(data["picks"]) == 8
        assert len(data["strategies"]) == 6
        assert len(data["automation_cards"]) == 6
        assert len(data["guardrails"]) == 8

        # Test save draft
        draft_res = save_draft(str(dataset.id), {"round": "R3"}, db)
        assert draft_res["status"] == "success"

        # Test send to labeling
        send_res = send_to_labeling(str(dataset.id), {"count": 500, "target_version": "v5"}, db)
        assert send_res["status"] == "success"
    finally:
        db.close()

def test_image_active_learning_dynamic_dataset():
    db: Session = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.name == "solar_panels_vision").first()
        if not dataset:
            dataset = Dataset(name="solar_panels_vision")
            db.add(dataset)
            db.flush()
            v1 = DatasetVersion(dataset_id=dataset.id, version_hash="sol_1", row_count=1500, size_bytes=1000, storage_path="sol1.parquet")
            v2 = DatasetVersion(dataset_id=dataset.id, version_hash="sol_2", row_count=1600, size_bytes=1000, storage_path="sol2.parquet")
            db.add_all([v1, v2])
            db.commit()

        data = get_data(str(dataset.id), "all", db)
        assert data["dataset_name"] == "solar_panels_vision"
        assert data["round_badge"] == "02"
        assert data["metrics"]["output"] == "v3"
        assert len(data["picks"]) == 8
    finally:
        db.close()
