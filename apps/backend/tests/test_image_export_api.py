import pytest
from app.core.database import SessionLocal
from app.services.image_export_api_service import image_export_api_service
from app.models.dataset import Dataset


def test_image_export_api_template_data():
    db = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.name.like("%defect%")).first()
        if not dataset:
            pytest.skip("Dataset defects non trouvé")
        
        data = image_export_api_service.get_state(str(dataset.id), db)
        assert data is not None
        assert "header" in data
        assert "yolo-defects-v4" in data["header"]["model_title"]
        assert data["header"]["badge_approved"] == "APPROVED IN 06"
        assert data["header"]["versions_on_line"] == "02"
        assert "datasets_export" in data
        assert len(data["datasets_export"]["formats"]) == 4
        assert "model_package" in data
        assert len(data["model_package"]["formats"]) == 4
        assert "deploy" in data
        assert len(data["deploy"]["pipeline"]) == 5
        assert "api_section" in data
        assert "curl_snippet" in data["api_section"]
        assert "versions_traffic" in data
        assert len(data["guardrails"]) >= 7
    finally:
        db.close()


def test_image_export_api_actions():
    db = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.name.like("%defect%")).first()
        if not dataset:
            pytest.skip("Dataset defects non trouvé")

        # Test download
        dl = image_export_api_service.download_dataset(str(dataset.id), {"version": "v4", "format": "yolo"}, db)
        assert dl["status"] == "success"
        assert "yolo" in dl["filename"]

        # Test build package
        pkg = image_export_api_service.build_package(str(dataset.id), {"format": "openvino_int8"}, db)
        assert pkg["status"] == "success"

        # Test shadow rollout
        shadow = image_export_api_service.start_shadow(str(dataset.id), {"device": "Line 2 · 1 device"}, db)
        assert shadow["status"] == "success"

        # Test create key
        key = image_export_api_service.create_api_key(str(dataset.id), {"name": "QC Test"}, db)
        assert key["status"] == "success"
        assert key["key"].startswith("dl_live_")

        # Test add webhook
        wh = image_export_api_service.add_webhook(str(dataset.id), {"url": "https://company.org/hook"}, db)
        assert wh["status"] == "success"

        # Test rollback
        rb = image_export_api_service.rollback_model(str(dataset.id), {"target_version": "v2"}, db)
        assert rb["status"] == "success"
    finally:
        db.close()

