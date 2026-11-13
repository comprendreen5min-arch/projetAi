import pytest
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.services.text_active_learning_service import text_active_learning_service
from app.api.v1.endpoints.text_active_learning import get_data, save_draft, send_to_labeling


def test_text_active_learning_template_data():
    db: Session = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(Dataset.name.ilike("%support_tickets%")).first()
        if not dataset:
            dataset = Dataset(name="support_tickets.jsonl")
            db.add(dataset)
            db.flush()
            v1 = DatasetVersion(dataset_id=dataset.id, version_hash="hash1", row_count=58300, size_bytes=1000, storage_path="dummy.parquet")
            v2 = DatasetVersion(dataset_id=dataset.id, version_hash="hash2", row_count=56048, size_bytes=1000, storage_path="dummy.parquet")
            v3 = DatasetVersion(dataset_id=dataset.id, version_hash="hash3", row_count=42752, size_bytes=1000, storage_path="dummy.parquet")
            db.add_all([v1, v2, v3])
            db.commit()

        # Call endpoint handler directly
        data = get_data(str(dataset.id), "all", db)

        assert data["display_title"] == "support_tickets.jsonl"
        assert data["kpis"]["pool"] == "6,820"
        assert data["kpis"]["budget"] == "600 tickets"
        assert data["round_badge"] == "03"
        assert data["kpis"]["output"] == "v5"

        # Loop
        assert len(data["loop_section"]["stages"]) == 5
        assert len(data["loop_section"]["rounds_history"]) == 3

        # What to pick
        assert len(data["what_to_pick"]["strategies"]) == 6
        assert data["what_to_pick"]["total_tickets"] == 600

        # Picks
        assert len(data["picks_section"]["picks"]) == 6
        assert data["picks_section"]["cluster_callout"]["cluster_id"] == 23

        # Is it worth it
        assert data["is_it_worth_it"]["chart"]["title"] == "Wrong labels found"
        assert len(data["is_it_worth_it"]["table"]["rows"]) == 2
        assert data["is_it_worth_it"]["table"]["rows"][0]["round"] == "R1"
        assert data["is_it_worth_it"]["stop_rule"]["title"] == "STOP RULE"

        # Automation & Guardrails
        assert len(data["automation"]) == 6
        assert len(data["guardrails"]) == 8

        # Filtered picks
        filt_data = get_data(str(dataset.id), "margin", db)
        assert len(filt_data["picks_section"]["picks"]) == 1
        assert filt_data["picks_section"]["picks"][0]["strategy_key"] == "margin"

        # Save draft
        save_res = save_draft(str(dataset.id), {"budget": 600, "strategies": []}, db)
        assert save_res["status"] == "ok"

        # Send to labeling
        send_res = send_to_labeling(str(dataset.id), {"count": 600, "target": "unlabeled"}, db)
        assert send_res["status"] == "ok"
    finally:
        db.close()


def test_text_active_learning_dynamic_dataset():
    db: Session = SessionLocal()
    try:
        dataset = db.query(Dataset).filter(
            (Dataset.name.ilike("%review%")) | (Dataset.name.ilike("%texte%"))
        ).first()

        if not dataset:
            dataset = Dataset(name="customer_reviews.parquet")
            db.add(dataset)
            db.flush()
            v1 = DatasetVersion(dataset_id=dataset.id, version_hash="hash_rev", row_count=500, size_bytes=1000, storage_path="dummy.parquet")
            db.add(v1)
            db.commit()

        data = get_data(str(dataset.id), "all", db)
        assert data["display_title"] == dataset.name
        assert data["kpis"]["pool"] is not None
        assert len(data["what_to_pick"]["strategies"]) == 6
        assert len(data["picks_section"]["picks"]) > 0
    finally:
        db.close()
