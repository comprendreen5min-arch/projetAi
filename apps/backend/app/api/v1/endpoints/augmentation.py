from pathlib import Path
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.dataset_version import DatasetVersion
from app.schemas.augmentation import (
    AugmentationApplyRequest,
    AugmentationApplyResponse,
    AugmentationComparisonRequest,
    AugmentationComparisonResponse,
    AugmentationPreviewRequest,
    AugmentationPreviewResponse,
)
from app.services.augmentation_service import augmentation_service

router = APIRouter()


@router.post("/preview", response_model=AugmentationPreviewResponse)
def preview_augmentation(
    payload: AugmentationPreviewRequest,
    db: Session = Depends(get_db),
):
    """Simule l'étape 03 Augmentation sans persister de fichier ni modifier la base de données.
    Vérifie les contraintes, calcule les splits, génère les données synthétiques,
    applique l'équilibrage et valide les guardrails.
    """
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == payload.source_version_hash).first()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version source '{payload.source_version_hash}' introuvable.",
        )

    file_path = Path(version.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichier Parquet source introuvable sur le disque.",
        )

    try:
        preview_res = augmentation_service.preview_augmentation(
            parquet_path=file_path,
            request=payload,
        )
        return preview_res
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la prévisualisation de l'augmentation: {str(exc)}",
        )


@router.post("/apply", response_model=AugmentationApplyResponse, status_code=status.HTTP_201_CREATED)
def apply_augmentation(
    payload: AugmentationApplyRequest,
    db: Session = Depends(get_db),
):
    """Applique l'augmentation de données côté serveur :
    - Exécute le découpage stratifié (avec group_by optionnel).
    - Génère les lignes SMOTE-NC déterministes et/ou sous-échantillonne la majorité.
    - Valide rigoureusement l'ensemble des 6 guardrails.
    - Écrit le Parquet atomiquement et crée la nouvelle DatasetVersion immuable (v3) + Transformation.
    - Calcule et stocke le profil de la nouvelle version.
    """
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == payload.source_version_hash).first()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version source '{payload.source_version_hash}' introuvable.",
        )

    file_path = Path(version.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichier Parquet source introuvable sur le disque.",
        )

    try:
        res = augmentation_service.apply_augmentation_and_create_version(
            db=db,
            source_version=version,
            request=payload,
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de l'application de l'augmentation: {str(exc)}",
        )

    new_version = res["new_version"]
    transformation = res["transformation"]
    pipe_res = res["pipeline_result"]
    before_prof = res["before_profile"]
    after_prof = res["after_profile"]

    return AugmentationApplyResponse(
        new_version_hash=new_version.version_hash,
        new_version_id=str(new_version.id),
        parent_version_hash=version.version_hash,
        total_rows=new_version.row_count,
        rows_in_train=pipe_res["rows_in_train_after"],
        rows_generated=pipe_res["rows_generated"],
        rows_undersampled=pipe_res["rows_undersampled"],
        transformation_name=transformation.name,
        parameters=transformation.parameters,
        recipe=res["recipe"],
        before_profile=before_prof,
        after_profile=after_prof,
        balance_score_delta=res["balance_score_delta"],
        guardrails=pipe_res["guardrails"],
    )


@router.post("/compare", response_model=AugmentationComparisonResponse)
def compare_augmentation(
    payload: AugmentationComparisonRequest,
    db: Session = Depends(get_db),
):
    """Phase 3 - Entraîne et compare un modèle sur v2 (train réel uniquement) vs v3 (train augmenté)
    évalué sur le même jeu de test réel. Répète l'expérience sur 5 graines pour fournir
    moyennes et écarts-types pour le Rappel, la Précision et le score F1 sur la classe rare.
    """
    version = db.query(DatasetVersion).filter(DatasetVersion.version_hash == payload.source_version_hash).first()
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Version source '{payload.source_version_hash}' introuvable.",
        )

    file_path = Path(version.storage_path)
    if not file_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Fichier Parquet source introuvable sur le disque.",
        )

    try:
        import pyarrow.parquet as pq
        table = pq.read_table(file_path)
        df = table.to_pandas()

        comparison_res = augmentation_service.run_model_comparison(
            df=df,
            target_column=payload.target_column,
            split_config=payload.split_config,
            balance_config=payload.balance_config,
            techniques=payload.techniques,
            model_type=payload.model_type,
            seeds=payload.seeds,
        )
        return comparison_res
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(ve),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la comparaison des modèles: {str(exc)}",
        )


