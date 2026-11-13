from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException, Body
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.text_training_service import text_training_service

router = APIRouter()


@router.get("/{dataset_id}/data")
def get_text_training_data(
    dataset_id: str,
    run_filter: Optional[str] = Query("all", description="Filter for runs: all, running, done"),
    selected_run_id: Optional[str] = Query(None, description="Currently selected run ID"),
    db: Session = Depends(get_db),
):
    """Returns complete dynamic training dashboard data for text modality."""
    return text_training_service.get_training_data(
        dataset_id=dataset_id,
        db=db,
        run_filter=run_filter,
        selected_run_id=selected_run_id,
    )


@router.post("/{dataset_id}/start-run")
def start_text_training_run(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Starts or schedules a new text model training run."""
    return text_training_service.start_run(dataset_id, payload, db)


@router.post("/{dataset_id}/promote")
def promote_text_candidate(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Promotes candidate model to production."""
    return text_training_service.promote_candidate(dataset_id, payload, db)

