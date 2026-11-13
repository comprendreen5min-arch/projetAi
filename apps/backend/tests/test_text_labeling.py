import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models.dataset import Dataset
from app.core.database import SessionLocal


def test_text_labeling_template_data():
    client = TestClient(app)
    db: Session = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.name.ilike("%support_tickets%")).first()
        if not dataset:
            dataset = db.query(Dataset).filter(Dataset.name.ilike("%ticket%")).first()

        assert dataset is not None, "support_tickets dataset must exist in DB"

        res = client.get(f"/api/v1/text-labeling/{dataset.id}/data?queue=unlabeled&index=0")
        assert res.status_code == 200
        data = res.json()

        assert data["display_title"] == "support_tickets.jsonl"
        assert data["kpis"]["to_label"] == "3,240"
        assert data["kpis"]["suspected_errors"] == "418"
        assert data["kpis"]["done_today"] == "520"
        assert data["kpis"]["output"] == "v4"
        assert data["gauge"]["coverage_after"] == 100

        # Queues
        assert len(data["queues"]) == 4
        assert data["queues"][0]["id"] == "unlabeled"
        assert data["queues"][0]["count"] == "3,240"
        assert data["queues"][0]["active"] is True

        # Workspace
        ws = data["workspace"]
        assert ws["ticket_id"] == "#52018"
        assert ws["language"] == "DARIJA"
        assert len(ws["tokens"]) >= 3
        assert len(ws["labels"]) == 7
        assert ws["labels"][0]["name"] == "billing"
        assert len(ws["model_suggestions"]) == 2
        assert len(ws["similar_tickets"]) == 3

        # Checks & Team & Guardrails
        assert len(data["label_checks"]) == 4
        assert len(data["team"]) == 2
        assert len(data["guardrails"]) == 6

        # Decision submission
        dec_res = client.post(
            f"/api/v1/text-labeling/{dataset.id}/decision",
            json={"ticket_id": "#52018", "label": "billing", "next_index": 1}
        )
        assert dec_res.status_code == 200

        # Save v4
        save_res = client.post(
            f"/api/v1/text-labeling/{dataset.id}/save-v4",
            json={"target_version": "v4"}
        )
        assert save_res.status_code == 200
        assert save_res.json()["version"] == "v4"

    finally:
        db.close()


def test_text_labeling_dynamic_dataset():
    client = TestClient(app)
    db: Session = SessionLocal()
    try:
        datasets = db.query(Dataset).all()
        target = None
        for d in datasets:
            if "ticket" not in d.name.lower() and ("text" in d.name.lower() or "review" in d.name.lower() or d.name.endswith(".txt")):
                target = d
                break

        if target is None:
            pytest.skip("No dynamic text dataset found")

        res = client.get(f"/api/v1/text-labeling/{target.id}/data?queue=unlabeled&index=0")
        assert res.status_code == 200
        data = res.json()

        assert data["dataset_id"] == str(target.id)
        assert len(data["queues"]) == 4
        assert len(data["workspace"]["labels"]) >= 2
        assert len(data["guardrails"]) == 6
    finally:
        db.close()

