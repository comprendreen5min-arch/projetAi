import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion


@pytest.fixture
def client():
    return TestClient(app)


def test_text_versioning_template_data(client):
    db = SessionLocal()
    try:
        ds = db.query(Dataset).filter(Dataset.name == "support_tickets.jsonl").first()
        if not ds:
            ds = Dataset(name="support_tickets.jsonl")
            db.add(ds)
            db.commit()
            db.refresh(ds)
            v = DatasetVersion(
                dataset_id=ds.id,
                version_hash="v3_mock",
                storage_path="/tmp/mock_tickets.parquet",
                row_count=58300,
                size_bytes=310000000,
                is_draft=False,
            )
            db.add(v)
            db.commit()

        res = client.get(f"/api/v1/text-versioning/{ds.id}/data")
        assert res.status_code == 200
        data = res.json()

        assert "support_tickets.jsonl" in data["display_title"]
        assert "3 VERSIONS" in data["breadcrumb"]
        assert data["kpis"]["versions"] == "3"
        assert "310 MB" in data["kpis"]["stored"]
        assert len(data["lineage"]) == 3
        assert data["lineage"][0]["rank"] == "V1 · RAW"
        assert data["lineage"][1]["rank"] == "V2 · CLEAN"
        assert data["lineage"][2]["rank"] == "V3 · AUGMENTED"
        assert data["compare"]["summary"]["removed"] == "-2,252"
        assert data["compare"]["summary"]["edited"] == "2,636"
        assert len(data["compare"]["diffs"]) == 5
        assert len(data["views"]) >= 7
        assert len(data["guardrails"]) == 6

        # Test tag-production
        tag_res = client.post(
            f"/api/v1/text-versioning/{ds.id}/tag-production",
            json={"version_hash": "v3"}
        )
        assert tag_res.status_code == 200
        assert tag_res.json()["tag"] == "PRODUCTION"

        # Test restore
        res_res = client.post(
            f"/api/v1/text-versioning/{ds.id}/restore",
            json={"version_hash": "v2"}
        )
        assert res_res.status_code == 200
        assert res_res.json()["status"] == "success"
    finally:
        db.close()


def test_text_versioning_dynamic_dataset(client):
    db = SessionLocal()
    try:
        ds = db.query(Dataset).filter(Dataset.name == "test_texte.txt").first()
        if not ds:
            ds = Dataset(name="test_texte.txt")
            db.add(ds)
            db.commit()
            db.refresh(ds)
            v = DatasetVersion(
                dataset_id=ds.id,
                version_hash="v1_test_txt",
                storage_path="/tmp/mock_test_txt.parquet",
                row_count=195,
                size_bytes=50000,
                is_draft=False,
            )
            db.add(v)
            db.commit()

        res = client.get(f"/api/v1/text-versioning/{ds.id}/data")
        assert res.status_code == 200
        data = res.json()

        assert "test_texte.txt" in data["display_title"]
        assert len(data["lineage"]) >= 2
        assert data["compare"]["summary"]["removed"] is not None
        assert len(data["views"]) >= 5
    finally:
        db.close()

