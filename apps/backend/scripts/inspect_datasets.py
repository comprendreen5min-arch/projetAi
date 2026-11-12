import sys
sys.path.insert(0, '/app')
import pyarrow.parquet as pq
from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion

def inspect_datasets():
    db = SessionLocal()
    datasets = db.query(Dataset).all()
    for d in datasets:
        version = db.query(DatasetVersion).filter(DatasetVersion.dataset_id == d.id).order_by(DatasetVersion.created_at.desc()).first()
        if version and version.storage_path:
            df = pq.read_table(version.storage_path).to_pandas()
            print(f"Dataset '{d.name}': {len(df)} rows, columns: {list(df.columns)}")
    db.close()

if __name__ == '__main__':
    inspect_datasets()
