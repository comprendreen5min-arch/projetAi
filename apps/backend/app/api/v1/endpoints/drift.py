from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.drift import (
    DriftStateResponse,
    UpdateDriftSettingsRequest,
    RunDriftCheckResponse,
)
from app.services.drift_service import drift_service

router = APIRouter()


@router.get("/{dataset_id}/state", response_model=DriftStateResponse)
def get_drift_state(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Returns complete drift monitoring state: monitored signals (multivariate, PSI, KS, Chi2),
    30-day timeline, data quality checks, model impact recall estimation, action decision cards,
    and monitoring thresholds.
    """
    return drift_service.get_state(dataset_id, db)


@router.put("/{dataset_id}/settings", response_model=DriftStateResponse)
def update_drift_settings(
    dataset_id: str,
    req: UpdateDriftSettingsRequest,
    db: Session = Depends(get_db),
):
    """Updates monitoring thresholds (PSI watch, PSI drift, window, min rows) and notification channels."""
    return drift_service.update_settings(dataset_id, req, db)


@router.post("/{dataset_id}/check-now", response_model=RunDriftCheckResponse)
def run_drift_check_now(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Executes an immediate live drift check, stores the run history, and returns status."""
    return drift_service.run_check_now(dataset_id, db)

