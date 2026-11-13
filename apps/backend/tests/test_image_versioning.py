import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.core.database import SessionLocal


def test_image_versioning_template_data():
    client = TestClient(app)
    db: Session = SessionLocal()
    try:
        # Find product_defects dataset
        dataset = db.query(Dataset).filter(Dataset.name.ilike("%product_defects%")).first()
        if not dataset:
            dataset = db.query(Dataset).filter(Dataset.name.ilike("%defect%")).first()

        assert dataset is not None, "product_defects dataset must exist in DB"

        res = client.get(f"/api/v1/image-versioning/{dataset.id}/data")
        assert res.status_code == 200, f"Error {res.status_code}: {res.text}"
        data = res.json()

        assert data["display_title"] == "product_defects/"
        assert data["kpis"]["versions"] == "3"
        assert "6.8 GB" in data["kpis"]["stored"]
        assert "21,430" in data["kpis"]["boxes"]
        assert len(data["lineage"]) == 3
        assert data["lineage"][0]["rank"] == "V1 · RAW"
        assert data["lineage"][1]["rank"] == "V2 · CLEAN"
        assert data["lineage"][2]["rank"] == "V3 · AUGMENTED"

        # Compare v1_v2
        v1_v2 = data["compare"]["v1_v2"]
        assert v1_v2["summary"]["removed"] == "-642"
        assert v1_v2["summary"]["edited"] == "418"
        assert v1_v2["summary"]["boxes"] == "100% moved"
        assert v1_v2["summary"]["classes"] == "6 → 6"
        assert len(v1_v2["diffs"]) == 4

        # Compare v2_v3
        v2_v3 = data["compare"]["v2_v3"]
        assert v2_v3["summary"]["edited"] == "+927"

        # Views & Guardrails
        assert len(data["views"]) >= 5
        assert len(data["guardrails"]) == 6
        assert data["views_api_note"] == "defects@v3?origin=real&class=crack"

        # Production tag
        tag_res = client.post(f"/api/v1/image-versioning/{dataset.id}/tag-production", json={"version_hash": "v3"})
        assert tag_res.status_code == 200

        # Restore
        restore_res = client.post(f"/api/v1/image-versioning/{dataset.id}/restore", json={"version_hash": "v1"})
        assert restore_res.status_code == 200

    finally:
        db.close()


def test_image_versioning_dynamic_dataset():
    client = TestClient(app)
    db: Session = SessionLocal()
    try:
        # Find another image dataset (e.g. test_images, my_test_images, dynamic_image_test)
        datasets = db.query(Dataset).all()
        target = None
        for d in datasets:
            if "defect" not in d.name.lower() and ("image" in d.name.lower() or "chat" in d.name.lower()):
                target = d
                break

        if target is None:
            pytest.skip("No dynamic image dataset found")

        res = client.get(f"/api/v1/image-versioning/{target.id}/data")
        assert res.status_code == 200
        data = res.json()

        assert data["dataset_id"] == str(target.id)
        assert int(data["kpis"]["versions"]) >= 1
        assert len(data["lineage"]) >= 1
        assert data["current_version"]["id"] is not None
        assert len(data["views"]) >= 4
    finally:
        db.close()

