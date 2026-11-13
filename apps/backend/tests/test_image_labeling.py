import pytest
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.services.image_labeling_service import image_labeling_service
from app.api.v1.endpoints.image_labeling import get_data, save_decision, save_version


def test_image_labeling_template_data():
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

        data = get_data(str(dataset.id), "unlabeled", 2, db)

        assert data["display_title"] == "product_defects/"
        assert data["kpis"]["to_label"] == "1,120"
        assert data["kpis"]["suspected_errors"] == "214"
        assert data["kpis"]["done_today"] == "386"
        assert data["gauge"]["coverage_after"] == 100

        # Queues
        assert len(data["queues"]) == 4
        assert data["queues"][0]["id"] == "unlabeled"
        assert data["queues"][0]["count"] == "1,120"
        assert data["queues"][0]["active"] is True

        # Workspace
        ws = data["workspace"]
        assert ws["image_name"] == "IMG_07734.JPG"
        assert len(ws["filmstrip"]) == 6
        assert len(ws["boxes"]) == 3
        assert len(ws["classes"]) == 6
        assert ws["classes"][0]["name"] == "ok"
        assert ws["classes"][5]["name"] == "crack"
        assert len(ws["model_suggestions"]) == 2

        # Label checks & team & guardrails
        assert len(data["label_checks"]) == 4
        assert len(data["team"]) == 3
        assert len(data["guardrails"]) == 6

        # Decision & save v4
        dec_res = save_decision(str(dataset.id), {"image_id": "IMG_07734.JPG", "boxes": []}, db)
        assert dec_res["status"] == "ok"

        save_res = save_version(str(dataset.id), {"version_name": "v4"}, db)
        assert save_res["status"] == "ok"
    finally:
        db.close()


def test_image_labeling_dynamic_dataset():
    db: Session = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(
            (Dataset.name.ilike("%image%")) & (~Dataset.name.ilike("%defect%"))
        ).first()

        if not dataset:
            dataset = Dataset(name="test_images")
            db.add(dataset)
            db.flush()
            v1 = DatasetVersion(dataset_id=dataset.id, version_hash="timg_h1", row_count=358, size_bytes=1000, storage_path="dummy.parquet")
            db.add(v1)
            db.commit()

        data = get_data(str(dataset.id), "unlabeled", 0, db)
        assert data["display_title"] == f"{dataset.name}/"
        assert data["kpis"]["to_label"] is not None
        assert len(data["queues"]) == 4
        assert len(data["workspace"]["boxes"]) > 0
    finally:
        db.close()

