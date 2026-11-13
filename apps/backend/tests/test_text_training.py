import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.core.database import SessionLocal
from app.models.dataset import Dataset


def test_text_training_template_data():
    client = TestClient(app)
    db: Session = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.name.ilike("%support_tickets%")).first()
        if not dataset:
            dataset = db.query(Dataset).filter(Dataset.name.ilike("%ticket%")).first()

        assert dataset is not None, "support_tickets dataset must exist in DB"

        res = client.get(f"/api/v1/text-training/{dataset.id}/data?run_filter=all")
        assert res.status_code == 200
        data = res.json()

        assert data["display_title"] == "support_tickets.jsonl"
        assert data["kpis"]["runs"] == "5"
        assert data["kpis"]["data_version"] == "tickets@v4"
        assert data["candidate_version"] == "v4"

        # Check section 1
        assert "new_run_config" in data
        assert len(data["new_run_config"]["models_to_try"]) >= 3
        assert len(data["new_run_config"]["checks_before_start"]) >= 4

        # Check section 2
        assert len(data["runs_section"]["runs"]) == 5
        assert data["runs_section"]["active_run"]["id"] == "ticket-cls-v4-b"

        # Check section 3
        assert data["evaluate"]["summary_kpis"]["macro_f1"] == "0.89"
        assert len(data["evaluate"]["per_label"]) == 7
        assert len(data["evaluate"]["confusion_matrix"]["labels"]) == 7
        assert len(data["evaluate"]["errors_to_look_at"]) == 3

        # Check section 4
        assert len(data["compare_and_promote"]["comparison_table"]) >= 5
        assert len(data["guardrails"]) >= 6

    finally:
        db.close()


def test_text_training_dynamic_dataset():
    client = TestClient(app)
    db: Session = SessionLocal()
    try:
        # Pick another text dataset
        dataset = db.query(Dataset).filter(
            (Dataset.name.ilike("%review%")) | (Dataset.name.ilike("%texte%"))
        ).first()

        if dataset:
            res = client.get(f"/api/v1/text-training/{dataset.id}/data?run_filter=all")
            assert res.status_code == 200
            data = res.json()

            assert data["display_title"] == dataset.name
            assert "kpis" in data
            assert "new_run_config" in data
            assert "runs_section" in data
            assert "evaluate" in data
            assert len(data["evaluate"]["per_label"]) > 0
    finally:
        db.close()


def test_text_training_actions():
    client = TestClient(app)
    db: Session = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.name.ilike("%ticket%")).first()
        if not dataset:
            dataset = db.query(Dataset).first()

        # Start run
        res = client.post(
            f"/api/v1/text-training/{dataset.id}/start-run",
            json={"model_type": "XLM-R", "epochs": 4, "batch_size": 32}
        )
        assert res.status_code == 200
        assert res.json()["status"] == "ok"

        # Promote candidate
        res2 = client.post(
            f"/api/v1/text-training/{dataset.id}/promote",
            json={"model_id": "ticket-cls-v4"}
        )
        assert res2.status_code == 200
        assert res2.json()["status"] == "ok"

    finally:
        db.close()

