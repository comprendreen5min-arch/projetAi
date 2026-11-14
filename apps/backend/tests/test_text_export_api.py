import pytest
from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.services.text_export_api_service import text_export_api_service


def test_text_export_api_template_dataset():
    db = SessionLocal()
    try:
        support_ds = db.query(Dataset).filter(Dataset.name.ilike("%ticket%")).first()
        if not support_ds:
            support_ds = db.query(Dataset).first()

        data = text_export_api_service.get_state(str(support_ds.id), db)
        assert data is not None
        assert "header" in data
        assert "datasets" in data
        assert "model_package" in data
        assert "deploy" in data
        assert "api" in data
        assert "versions_traffic" in data
        assert "guardrails" in data
        assert len(data["guardrails"]) >= 6

        # Test deploy to staging
        deploy_res = text_export_api_service.deploy_to_staging(str(support_ds.id), db)
        assert deploy_res["success"] is True

        # Test create api key
        key_res = text_export_api_service.create_api_key(str(support_ds.id), "Test Key", "classify", db)
        assert "key" in key_res
        assert key_res["status"] == "LIVE"

        # Test build package
        build_res = text_export_api_service.build_package(str(support_ds.id), "docker", db)
        assert build_res["status"] == "completed"

    finally:
        db.close()


def test_text_export_api_dynamic_dataset():
    db = SessionLocal()
    try:
        other_ds = db.query(Dataset).filter(~Dataset.name.ilike("%ticket%")).first()
        if not other_ds:
            pytest.skip("No non-ticket dataset available in test DB")

        data = text_export_api_service.get_state(str(other_ds.id), db)
        assert data is not None
        assert data["dataset_name"] == other_ds.name
        assert "header" in data
        assert "datasets" in data
        assert "model_package" in data
        assert "deploy" in data
    finally:
        db.close()

