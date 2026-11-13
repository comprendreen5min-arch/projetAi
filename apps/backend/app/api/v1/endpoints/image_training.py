from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, Body
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.image_training_service import image_training_service

router = APIRouter()

@router.get("/{dataset_id}/data")
def get_data(
    dataset_id: str,
    run_filter: Optional[str] = Query("all"),
    selected_run_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Retrieve Image Training experiment and model metrics data."""
    return image_training_service.get_training_data(dataset_id, db, run_filter, selected_run_id)

@router.post("/{dataset_id}/start-run")
def start_run(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Launch a new YOLO training run."""
    return image_training_service.start_run(dataset_id, payload, db)

@router.post("/{dataset_id}/shadow-mode")
def start_shadow_mode(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Start shadow mode deployment on edge devices."""
    return image_training_service.start_shadow_mode(dataset_id, payload, db)

