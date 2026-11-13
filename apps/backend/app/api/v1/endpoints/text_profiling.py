from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.text_profiling_service import text_profiling_service

router = APIRouter()


@router.get("/{dataset_id}/profile", response_model=Dict[str, Any])
def get_text_profile(
    dataset_id: str,
    version_hash: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Computes and returns the complete text NLP profile for a dataset."""
    return text_profiling_service.profile_dataset(dataset_id=dataset_id, db=db, version_hash=version_hash)


@router.post("/upload", response_model=Dict[str, Any])
async def upload_text_file(
    file: UploadFile = File(...),
    dataset_name: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Uploads a text dataset (.jsonl, .csv, .txt) and returns its profile."""
    return await text_profiling_service.upload_text_file(file=file, db=db, dataset_name=dataset_name)
