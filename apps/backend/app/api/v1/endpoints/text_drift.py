from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.text_drift_service import text_drift_service

router = APIRouter()

@router.get("/{dataset_id}/data")
def get_data(
    dataset_id: str,
    db: Session = Depends(get_db)
):
    """Retrieve text drift monitoring data."""
    return text_drift_service.get_drift_data(dataset_id, db)

@router.post("/{dataset_id}/save-settings")
def save_settings(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Save monitoring thresholds and settings."""
    return text_drift_service.save_settings(dataset_id, payload, db)

@router.post("/{dataset_id}/run-check")
def run_check(
    dataset_id: str,
    db: Session = Depends(get_db)
):
    """Run an on-demand drift analysis."""
    return text_drift_service.run_check(dataset_id, db)

@router.post("/{dataset_id}/adopt-reference")
def adopt_reference(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Adopt current live window as reference."""
    return text_drift_service.adopt_reference(dataset_id, payload, db)

@router.post("/{dataset_id}/send-cluster-to-07")
def send_cluster_to_07(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db)
):
    """Send drift cluster to Active Learning 07."""
    return text_drift_service.send_cluster_to_07(dataset_id, payload, db)

