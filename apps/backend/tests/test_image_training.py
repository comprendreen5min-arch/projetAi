import pytest
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.api.v1.endpoints.image_training import get_data, start_run, start_shadow_mode


def test_image_training_template_data():
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

        data = get_data(str(dataset.id), "all", None, db)

        assert data["display_title"] == "product_defects/"
        assert data["candidate_version"] == "v4"
        assert data["kpis"]["runs"] == "5"
        assert data["kpis"]["data"] == "defects@v4"
        assert data["kpis"]["compute"] == "21 GPU h"
        assert data["kpis"]["in_production"] == "yolo-defects-v3"

        # Section 1 New run
        new_run = data["new_run_config"]
        assert new_run["dataset_version"] == "defects@v4 · current"
        assert len(new_run["on_the_fly_augmentation"]) == 6
        assert len(new_run["checks_before_start"]) == 5

        # Section 2 Runs
        runs_sec = data["runs_section"]
        assert len(runs_sec["runs"]) == 5
        assert runs_sec["active_run"]["id"] == "yolo-defects-v4-m"
        assert len(runs_sec["active_run"]["val_preview"]) == 4

        # Section 3 Evaluate
        eval_sec = data["evaluate"]
        assert eval_sec["summary_kpis"]["map50"] == "0.892"
        assert len(eval_sec["per_class"]) == 6
        assert len(eval_sec["confusion_matrix"]["labels"]) == 7
        assert len(eval_sec["slices"]) == 5
        assert len(eval_sec["errors_to_look_at"]) == 4

        # Section 4 Compare and promote
        comp = data["compare_and_promote"]
        assert len(comp["comparison_table"]) == 4
        assert len(comp["before_production"]) == 6
        assert len(comp["edge_benchmark"]) == 3

        # Guardrails
        assert len(data["guardrails"]) == 8

        # Start run and shadow mode
        res_run = start_run(str(dataset.id), {"architecture": "YOLO11-s"}, db)
        assert res_run["status"] == "ok"
        res_shadow = start_shadow_mode(str(dataset.id), {"device": "Line 2 mini PC"}, db)
        assert res_shadow["status"] == "ok"
    finally:
        db.close()


def test_image_training_dynamic_dataset():
    db: Session = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.name == "test_images").first()
        if not dataset:
            dataset = Dataset(name="test_images")
            db.add(dataset)
            db.flush()
            v1 = DatasetVersion(dataset_id=dataset.id, version_hash="ti_h1", row_count=358, size_bytes=90000000, storage_path="dummy.parquet")
            db.add(v1)
            db.commit()

        data = get_data(str(dataset.id), "all", None, db)

        assert data["display_title"] == "test_images/"
        assert "kpis" in data
        assert "new_run_config" in data
        assert "runs_section" in data
        assert "evaluate" in data
        assert "compare_and_promote" in data
        assert len(data["guardrails"]) == 8
    finally:
        db.close()

