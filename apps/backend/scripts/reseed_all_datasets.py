import sys
sys.path.insert(0, '/app')
from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.training_run import TrainingRun
from app.services.training_service import training_service

def reseed_all():
    db = SessionLocal()
    datasets = db.query(Dataset).all()
    print(f"Total datasets: {len(datasets)}")
    for d in datasets:
        version = db.query(DatasetVersion).filter(DatasetVersion.dataset_id == d.id).order_by(DatasetVersion.created_at.desc()).first()
        if not version:
            continue
        # Delete old runs
        old_runs = db.query(TrainingRun).filter(TrainingRun.dataset_id == d.id).all()
        for r in old_runs:
            db.delete(r)
        db.commit()
        
        # Now seed fresh runs using actual data
        training_service._ensure_default_runs_seeded(d, version, db)
        
        # Fetch header
        header = training_service.get_training_header(str(d.id), db)
        print(f"\nDataset: {d.name}")
        print(f"  Version: {header.data_version_label}")
        print(f"  Runs: {header.total_runs}, Prod: {header.production_run_name}, Cand: {header.candidate_run_name}")
        
        # Fetch candidate detail
        cand = db.query(TrainingRun).filter(TrainingRun.dataset_id == d.id, TrainingRun.tag == "candidate").first()
        if cand:
            detail = training_service.get_run_detail(str(cand.id), "val", None, db)
            print(f"  Val rows: {detail.val_rows}, Test rows: {detail.test_rows}, Recall: {detail.recall_yes}")
            print(f"  Drivers ({len(detail.feature_drivers)}): {[f.feature for f in detail.feature_drivers]}")
            print(f"  Slices ({len(detail.slices)}): {[s.segment for s in detail.slices]}")
            
    db.close()

if __name__ == '__main__':
    reseed_all()

