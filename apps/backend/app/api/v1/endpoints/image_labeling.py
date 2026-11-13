from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.image_labeling_service import image_labeling_service

router = APIRouter()

@router.get("/{dataset_id}/data")
def get_data(
    dataset_id: str,
    queue: Optional[str] = Query("unlabeled"),
    image_index: Optional[int] = Query(2),
    db: Session = Depends(get_db)
):
    """Retrieve image labeling workflow and workspace data."""
    return image_labeling_service.get_labeling_data(dataset_id, db, queue, image_index)

@router.post("/{dataset_id}/decision")
def save_decision(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Save bounding box annotations or label decisions for an image."""
    return image_labeling_service.save_decision(dataset_id, payload, db)

@router.post("/{dataset_id}/save-v4")
def save_version(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Save the labeled image dataset as a new version."""
    return image_labeling_service.save_version(dataset_id, payload, db)

