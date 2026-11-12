from app.core.database import SessionLocal
from app.models.training_run import TrainingRun
from app.models.dataset import Dataset

def inspect():
    db = SessionLocal()
    datasets = db.query(Dataset).all()
    print(f"Total datasets: {len(datasets)}")
    for d in datasets:
        runs = db.query(TrainingRun).filter(TrainingRun.dataset_id == d.id).all()
        print(f"Dataset '{d.name}' ({d.id}): {len(runs)} runs, names: {[r.run_name for r in runs]}")
    db.close()

if __name__ == '__main__':
    inspect()

