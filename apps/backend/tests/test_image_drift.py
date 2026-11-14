import pytest
from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.services.image_drift_service import image_drift_service


def test_image_drift_template_dataset():
    db = SessionLocal()
    try:
        defect_ds = db.query(Dataset).filter(Dataset.name.ilike("%defect%")).first()
        if not defect_ds:
            pytest.skip("Dataset product_defects not found")

        data = image_drift_service.get_drift_data(str(defect_ds.id), db)
        assert data is not None
        assert data["display_title"] == "product_defects/"
        assert data["alert_badge"]["count"] == "02"
        assert data["alert_badge"]["label"] == "CAMERAS DRIFTING"
        assert len(data["signals"]) == 8
        assert data["selected_signal_detail"]["title"] == "brightness · line 2 · cam 4"
        assert len(data["data_quality"]["checks"]) == 6
        assert len(data["model_impact"]["segments"]) == 4
        assert len(data["what_to_do"]["cards"]) == 4
        assert len(data["monitoring"]["checklist"]) == 6
        assert len(data["guardrails"]) == 8

        # Test operations
        res_check = image_drift_service.run_check(str(defect_ds.id), db)
        assert res_check["status"] == "success"

        res_07 = image_drift_service.send_to_07(str(defect_ds.id), {"count": 300}, db)
        assert res_07["count"] == 300

        res_line = image_drift_service.report_to_line(str(defect_ds.id), {"camera": "cam 4"}, db)
        assert res_line["camera"] == "cam 4"

    finally:
        db.close()


def test_image_drift_dynamic_dataset():
    db = SessionLocal()
    try:
        other_ds = db.query(Dataset).filter(
            Dataset.name.in_(["test_images", "solar_panels_vision"])
        ).first()
        if not other_ds:
            pytest.skip("No dynamic image dataset found")

        data = image_drift_service.get_drift_data(str(other_ds.id), db)
        assert data is not None
        assert data["dataset_name"] == other_ds.name
        assert len(data["signals"]) >= 4
        assert "data_quality" in data
        assert "model_impact" in data

    finally:
        db.close()

