from typing import Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.services.text_export_api_service import text_export_api_service

router = APIRouter()


@router.get("/{dataset_id}/state")
def get_text_export_state(dataset_id: str, db: Session = Depends(get_db)):
    """Retrieve full text export & API state for a dataset."""
    return text_export_api_service.get_state(dataset_id, db)


@router.put("/{dataset_id}/settings")
def update_text_export_settings(
    dataset_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
):
    """Update export and packaging settings."""
    return text_export_api_service.update_settings(dataset_id, payload, db)


@router.post("/{dataset_id}/deploy-staging")
def deploy_text_to_staging(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Trigger deployment of text candidate model to staging."""
    return text_export_api_service.deploy_to_staging(dataset_id, db)


@router.post("/{dataset_id}/api-keys")
def create_text_api_key(
    dataset_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
):
    """Generate a new scoped API key."""
    name = payload.get("name", "New Key")
    scope = payload.get("scope", "classify")
    return text_export_api_service.create_api_key(dataset_id, name, scope, db)


@router.post("/{dataset_id}/webhooks")
def add_text_webhook(
    dataset_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
):
    """Register a new webhook listener."""
    event = payload.get("event", "dataset.version_tagged")
    url = payload.get("url", "https://example.com/webhook")
    return text_export_api_service.add_webhook(dataset_id, event, url, db)


@router.post("/{dataset_id}/build-package")
def build_text_package(
    dataset_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
):
    """Build standalone inference model package."""
    format_id = payload.get("format_id", "docker")
    return text_export_api_service.build_package(dataset_id, format_id, db)

