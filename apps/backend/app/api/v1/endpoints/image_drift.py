from typing import Dict, Any
from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.image_drift_service import image_drift_service

router = APIRouter()


@router.get("/{dataset_id}/data")
def get_data(dataset_id: str, db: Session = Depends(get_db)):
    """Retrieve complete drift telemetry data for image dataset."""
    return image_drift_service.get_drift_data(dataset_id, db)


@router.post("/{dataset_id}/save-settings")
def save_settings(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Save monitoring thresholds and checklist configuration."""
    return image_drift_service.save_settings(dataset_id, payload, db)


@router.post("/{dataset_id}/run-check")
def run_check(dataset_id: str, db: Session = Depends(get_db)):
    """Trigger manual CV drift inspection check."""
    return image_drift_service.run_check(dataset_id, db)


@router.post("/{dataset_id}/adopt-reference")
def adopt_reference(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Adopt shifted camera/sensor as new golden baseline reference."""
    return image_drift_service.adopt_reference(dataset_id, payload, db)


@router.post("/{dataset_id}/send-to-07")
def send_to_07(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Send drifted or uncertain frames to 07 Active Learning pool."""
    return image_drift_service.send_to_07(dataset_id, payload, db)


@router.post("/{dataset_id}/report-to-line")
def report_to_line(
    dataset_id: str,
    payload: Dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Send incident report and sample frames to line operators/maintenance."""
    return image_drift_service.report_to_line(dataset_id, payload, db)

