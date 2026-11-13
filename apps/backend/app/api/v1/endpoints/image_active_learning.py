from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.image_active_learning_service import image_active_learning_service

router = APIRouter()

@router.get("/{dataset_id}/data")
def get_data(
    dataset_id: str,
    strategy_filter: Optional[str] = Query("all"),
    db: Session = Depends(get_db)
):
    """Retrieve active learning workflow and draft round data for image dataset."""
    return image_active_learning_service.get_active_learning_data(dataset_id, db, strategy_filter)

@router.post("/{dataset_id}/save-draft")
def save_draft(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Save active learning draft configuration."""
    return image_active_learning_service.save_draft(dataset_id, payload, db)

@router.post("/{dataset_id}/send-to-labeling")
def send_to_labeling(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Send picked active learning images to 05 Labeling queue."""
    return image_active_learning_service.send_to_labeling(dataset_id, payload, db)

