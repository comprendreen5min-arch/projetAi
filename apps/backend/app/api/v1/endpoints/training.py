from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.training_run import TrainingRun
from app.schemas.training import (
    CompareResponse,
    StartRunRequest,
    TrainingConfigResponse,
    TrainingHeaderSummary,
    TrainingRunDetailResponse,
    TrainingRunListItem,
)
from app.services.training_service import training_service

router = APIRouter()


@router.get("/{dataset_id}/config", response_model=TrainingConfigResponse)
def get_training_config(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Returns dataset training configuration, feature handlings, and pre-run sanity checks."""
    return training_service.get_pre_run_checks_and_config(dataset_id, db)


@router.get("/{dataset_id}/header", response_model=TrainingHeaderSummary)
def get_training_header(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Returns top KPI header summary cards and candidate run badge."""
    return training_service.get_training_header(dataset_id, db)


@router.get("/{dataset_id}/runs", response_model=List[TrainingRunListItem])
def list_training_runs(
    dataset_id: str,
    status: Optional[str] = Query(None, description="Status filter: all, running, done, failed"),
    db: Session = Depends(get_db),
):
    """Lists training runs for Section 2 with optional status filter."""
    return training_service.list_runs(dataset_id, status, db)


@router.get("/runs/{run_id}", response_model=TrainingRunDetailResponse)
def get_training_run_detail(
    run_id: str,
    split: str = Query("val", description="Split evaluated: val or test"),
    threshold: Optional[float] = Query(None, description="Override threshold for dynamic cost calculation"),
    db: Session = Depends(get_db),
):
    """Returns full evaluation metrics, PR curve, confusion matrix, SHAP drivers, slices, and errors."""
    return training_service.get_run_detail(run_id, split=split, threshold_override=threshold, db=db)


@router.post("/{dataset_id}/runs")
def start_training_run(
    dataset_id: str,
    req: StartRunRequest,
    db: Session = Depends(get_db),
):
    """Starts a new training run / experiment."""
    new_run = training_service.start_training_run(dataset_id, req, db)
    return {"success": True, "run_id": str(new_run.id), "run_name": new_run.run_name}


@router.post("/runs/{run_id}/stop")
def stop_training_run(
    run_id: str,
    db: Session = Depends(get_db),
):
    """Stops an active training run."""
    run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Exécution introuvable.")
    if run.status == "running":
        run.status = "done"
        run.tag = "candidate"
        db.commit()
    return {"success": True, "message": f"Exécution {run.run_name} arrêtée avec succès."}


@router.post("/runs/{run_id}/evaluate-test")
def evaluate_on_test_set(
    run_id: str,
    db: Session = Depends(get_db),
):
    """Unlocks locked test set evaluation for a run (increments test_eval_count guardrail)."""
    return training_service.evaluate_on_test_set(run_id, db)


@router.post("/runs/{run_id}/promote")
def promote_run_to_production(
    run_id: str,
    db: Session = Depends(get_db),
):
    """Promotes a candidate run to production, archiving previous production run."""
    run = db.query(TrainingRun).filter(TrainingRun.id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Exécution introuvable.")

    # Archive existing production runs on this dataset
    db.query(TrainingRun).filter(
        TrainingRun.dataset_id == run.dataset_id,
        TrainingRun.tag == "production",
    ).update({"tag": "archived"})

    run.tag = "production"
    db.commit()
    return {"success": True, "message": f"Modèle {run.run_name} promu en production."}


@router.get("/{dataset_id}/compare", response_model=CompareResponse)
def compare_production_and_candidate(
    dataset_id: str,
    db: Session = Depends(get_db),
):
    """Returns Section 4 Compare and promote comparison table against locked test set."""
    return training_service.compare_production_and_candidate(dataset_id, db)
