import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion


@pytest.fixture
def client():
    return TestClient(app)


def test_text_augmentation_template_recipe(client):
    db = SessionLocal()
    try:
        ds = db.query(Dataset).filter(Dataset.name == "support_tickets.jsonl").first()
        if not ds:
            ds = Dataset(name="support_tickets.jsonl")
            db.add(ds)
            db.commit()
            db.refresh(ds)
            version = DatasetVersion(
                dataset_id=ds.id,
                version_hash="v2_mock",
                row_count=58300,
                size_bytes=41000000,
                is_draft=False,
            )
            db.add(version)
            db.commit()

        res = client.get(f"/api/v1/text-augmentation/{ds.id}/recipe")
        assert res.status_code == 200
        data = res.json()

        assert "support_tickets.jsonl" in data["display_title"]
        assert data["breadcrumb"] == "DATASET · V2 CLEAN → V3 AUGMENTED · TEXT CLASSIFICATION"
        assert data["kpis"]["tickets_in_train"] == "42,752"
        assert data["kpis"]["generated"] == "3,529"
        assert data["kpis"]["test_set"] == "8,407"
        assert data["kpis"]["output"] == "v3"

        assert data["label_balance"]["before"] == 58
        assert data["label_balance"]["after"] == 71

        assert len(data["techniques"]) == 5
        assert len(data["guardrails"]) == 5
        assert "darija_codeswitch" in data["previews"]
    finally:
        db.close()


def test_text_augmentation_compare_and_save(client):
    db = SessionLocal()
    try:
        ds = db.query(Dataset).filter(Dataset.name == "support_tickets.jsonl").first()
        assert ds is not None

        # Test compare
        res_comp = client.post(
            f"/api/v1/text-augmentation/{ds.id}/compare",
            json={"model": "fast_classifier"}
        )
        assert res_comp.status_code == 200
        comp_data = res_comp.json()
        assert comp_data["without_v2"] == 0.72
        assert comp_data["with_v3"] == 0.81
        assert comp_data["delta"] == "+0.09"

        # Test save-v3
        res_save = client.post(
            f"/api/v1/text-augmentation/{ds.id}/save-v3",
            json={
                "split_config": {"train_pct": 70, "val_pct": 15, "test_pct": 15},
                "target_balance": {"mode": "4000"},
                "techniques": ["paraphrase_llm", "back_translation", "darija_codeswitch", "typos_casing"],
            }
        )
        assert res_save.status_code == 200
        save_data = res_save.json()
        assert save_data["saved"] is True
        assert save_data["kpis"]["output"] == "v3"
    finally:
        db.close()

