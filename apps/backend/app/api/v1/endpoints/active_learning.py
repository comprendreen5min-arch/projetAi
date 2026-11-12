from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.active_learning import (
    ActiveLearningStateResponse,
    UpdateRoundSettingsRequest,
    SendToLabelingRequest,
    SendToLabelingResponse,
)
from app.services.active_learning_service import active_learning_service

router = APIRouter()


@router.get("/{dataset_id}/state", response_model=ActiveLearningStateResponse)
def get_active_learning_state(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Returns the full dynamic active learning cycle state for the dataset,
    including pool score, strategy breakdown, 2D map projection, candidate picks,
    and guardrail checks.
    """
    return active_learning_service.get_state(dataset_id, db)


@router.put("/{dataset_id}/settings", response_model=ActiveLearningStateResponse)
def update_round_settings(
    dataset_id: str,
    req: UpdateRoundSettingsRequest,
    db: Session = Depends(get_db),
):
    """Updates budget, strategy slider distributions, stop rules, and automation settings."""
    return active_learning_service.update_settings(dataset_id, req, db)


@router.post("/{dataset_id}/send-to-labeling", response_model=SendToLabelingResponse)
def send_picks_to_labeling(
    dataset_id: str,
    req: SendToLabelingRequest,
    db: Session = Depends(get_db),
):
    """Enqueues candidate picks to Step 05 Labeling queue and prepares next version draft."""
    return active_learning_service.send_to_labeling(dataset_id, req, db)

