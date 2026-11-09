from pathlib import Path
from uuid import UUID
from app.core.config import settings


class StorageService:
    def __init__(self, base_storage_dir: Path = settings.STORAGE_DIR):
        self.base_storage_dir = Path(base_storage_dir)
        self.base_storage_dir.mkdir(parents=True, exist_ok=True)

    def get_dataset_dir(self, dataset_id: UUID) -> Path:
        dataset_dir = self.base_storage_dir / str(dataset_id)
        dataset_dir.mkdir(parents=True, exist_ok=True)
        return dataset_dir

    def get_version_parquet_path(self, dataset_id: UUID, version_hash: str) -> Path:
        dataset_dir = self.get_dataset_dir(dataset_id)
        return dataset_dir / f"{version_hash}.parquet"


storage_service = StorageService()

