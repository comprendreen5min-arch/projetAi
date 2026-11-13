import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion


@pytest.fixture
def client():
    return TestClient(app)


def test_image_augmentation_template_recipe(client):
    db = SessionLocal()
    try:
        ds = db.query(Dataset).filter(Dataset.name == "product_defects/").first()
        if not ds:
            ds = Dataset(name="product_defects/")
            db.add(ds)
            db.commit()
            db.refresh(ds)

        version = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == ds.id)
            .first()
        )
        if not version:
            version = DatasetVersion(
                dataset_id=ds.id,
                version_hash="v2_mock",
                storage_path="/tmp/mock_defects.parquet",
                row_count=11838,
                size_bytes=42000000,
                is_draft=False,
            )
            db.add(version)
            db.commit()

        res = client.get(f"/api/v1/image-augmentation/{ds.id}/recipe")
        assert res.status_code == 200
        data = res.json()

        assert "product_defects" in data["display_title"]
        assert "OBJECT DETECTION" in data["breadcrumb"]
        assert data["kpis"]["images_in_train"] == "8,470"
        assert data["kpis"]["generated"] == "927"
        assert data["kpis"]["test_set"] == "1,776"
        assert data["health"]["before"] == 38
        assert data["health"]["after"] == 74
        assert len(data["techniques"]) == 5
        assert len(data["target_balance"]["classes"]) == 6
        assert len(data["previews"]["copy_paste_defects"]["cards"]) == 4

        # Test compare endpoint
        cmp_res = client.post(
            f"/api/v1/image-augmentation/{ds.id}/compare",
            json={"techniques": ["flip_crop_scale", "light_colour", "copy_paste_defects"]}
        )
        assert cmp_res.status_code == 200
        cmp_data = cmp_res.json()
        assert "mAP@50" in cmp_data["metric"]
        assert cmp_data["with_v3"] is not None

        # Test save-v3 endpoint
        save_res = client.post(
            f"/api/v1/image-augmentation/{ds.id}/save-v3",
            json={
                "split_config": data["split_config"],
                "target_balance": data["target_balance"],
                "techniques": ["flip_crop_scale", "light_colour", "copy_paste_defects"]
            }
        )
        assert save_res.status_code == 200
        save_data = save_res.json()
        assert save_data["saved"] is True
        assert "v3_" in save_data["new_version_hash"]
    finally:
        db.close()


def test_image_augmentation_dynamic_dataset(client):
    db = SessionLocal()
    try:
        ds = db.query(Dataset).filter(Dataset.name == "dynamic_image_test").first()
        if not ds:
            ds = Dataset(name="dynamic_image_test")
            db.add(ds)
            db.commit()
            db.refresh(ds)

        version = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == ds.id)
            .first()
        )
        if not version:
            version = DatasetVersion(
                dataset_id=ds.id,
                version_hash="v2_test",
                storage_path="/tmp/mock_test.parquet",
                row_count=450,
                size_bytes=5000000,
                is_draft=False,
            )
            db.add(version)
            db.commit()

        res = client.get(f"/api/v1/image-augmentation/{ds.id}/recipe")
        assert res.status_code == 200
        data = res.json()

        assert "dynamic_image_test" in data["display_title"]
        assert data["kpis"]["images_in_train"] is not None
        assert len(data["techniques"]) >= 4
        assert len(data["target_balance"]["classes"]) >= 3
    finally:
        db.close()
