from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.services.image_profiling_service import image_profiling_service

router = APIRouter()


@router.get("/{dataset_id}/profile", response_model=Dict[str, Any])
def get_image_profile(
    dataset_id: str,
    version_hash: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Calcule et renvoie le profil complet de détection / qualité d'image d'un dataset."""
    return image_profiling_service.profile_dataset(dataset_id=dataset_id, db=db, version_hash=version_hash)


@router.post("/upload", response_model=Dict[str, Any])
async def upload_image_archive(
    file: UploadFile = File(...),
    dataset_name: Optional[str] = Form(None),
    db: Session = Depends(get_db),
):
    """Importe une archive ZIP d'images ou un fichier image et génère son profil."""
    contents = await file.read()
    return image_profiling_service.upload_image_archive(
        file_bytes=contents,
        filename=file.filename or "uploaded_images.zip",
        db=db,
        dataset_name=dataset_name,
    )

