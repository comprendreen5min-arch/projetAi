from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.labeling import (
    BulkFixRequest,
    DecisionRequest,
    LabelChecksResponse,
    LabelingStatusResponse,
    QueueItemResponse,
    SaveVersionRequest,
    SaveVersionResponse,
)
from app.services.labeling_service import labeling_service

router = APIRouter()


@router.get("/{dataset_id}/status", response_model=LabelingStatusResponse)
def get_labeling_status(
    dataset_id: str,
    target_column: Optional[str] = Query(None, description="Colonne cible sélectionnée"),
    threshold: float = Query(0.90, ge=0.5, le=0.99, description="Seuil de confiance du modèle"),
    db: Session = Depends(get_db),
):
    """Retourne la synthèse globale de labellisation : compteurs des files d'attente,
    score de confiance des labels, cible active et métriques d'en-tête.
    """
    return labeling_service.get_labeling_status(
        dataset_id=dataset_id,
        target_column_override=target_column,
        threshold=threshold,
        db=db,
    )


@router.get("/{dataset_id}/candidate", response_model=QueueItemResponse)
def get_queue_candidate(
    dataset_id: str,
    queue: str = Query("suspected_errors", description="Identifiant de la file d'attente"),
    index: int = Query(0, ge=0, description="Index de l'élément dans la file"),
    target_column: Optional[str] = Query(None, description="Colonne cible"),
    threshold: float = Query(0.90, ge=0.5, le=0.99, description="Seuil de certitude"),
    db: Session = Depends(get_db),
):
    """Retourne le candidat de la file d'attente spécifiée avec l'ensemble de ses
    caractéristiques, surbrillances sémantiques, historique et plus proches voisins.
    """
    return labeling_service.get_candidate_for_queue(
        dataset_id=dataset_id,
        queue_id=queue,
        item_index=index,
        target_column_override=target_column,
        threshold=threshold,
        db=db,
    )


@router.post("/{dataset_id}/decision", status_code=status.HTTP_200_OK)
def apply_label_decision(
    dataset_id: str,
    req: DecisionRequest,
    db: Session = Depends(get_db),
):
    """Enregistre une décision humaine (Conserver, Changer, Pas encore connu, Incertain)
    avec traçabilité et motif obligatoire.
    """
    change = labeling_service.apply_decision(
        dataset_id=dataset_id,
        row_index=req.row_index,
        customer_id=req.customer_id,
        decision=req.decision,
        new_label=req.new_label,
        reason=req.reason,
        queue_id=req.queue_id,
        db=db,
    )
    return {
        "success": True,
        "message": f"Décision '{req.decision}' enregistrée pour la ligne {req.customer_id}.",
        "change_id": str(change.id),
        "new_label": change.new_label,
    }


@router.post("/{dataset_id}/bulk-fix", status_code=status.HTTP_200_OK)
def apply_bulk_fix(
    dataset_id: str,
    req: BulkFixRequest,
    db: Session = Depends(get_db),
):
    """Applique une correction en masse à un groupe de lignes correspondant à un motif métier."""
    count = labeling_service.apply_bulk_fix(
        dataset_id=dataset_id,
        row_indices=req.row_indices,
        new_label=req.new_label,
        reason=req.reason,
        pattern_description=req.pattern_description,
        db=db,
    )
    return {
        "success": True,
        "message": f"{count} lignes corrigées en masse avec succès.",
        "modified_count": count,
    }


@router.get("/{dataset_id}/checks", response_model=LabelChecksResponse)
def get_checks_and_guardrails(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Retourne la liste des contrôles automatiques exécutés, le journal des modifications du jour,
    et le statut de validation des garde-fous.
    """
    return labeling_service.get_checks_and_guardrails(dataset_id=dataset_id, db=db)


@router.post("/{dataset_id}/save-version", response_model=SaveVersionResponse)
def save_labeling_version(
    dataset_id: str,
    req: SaveVersionRequest,
    db: Session = Depends(get_db),
):
    """Génère et enregistre une nouvelle version immuable (ex: v4) avec les labels corrigés,
    le journal des modifications attaché et la conservation du lignage.
    """
    return labeling_service.save_labeling_version(
        dataset_id=dataset_id,
        rerun_augmentation=req.rerun_augmentation,
        version_label_override=req.version_label,
        description=req.description,
        db=db,
    )

