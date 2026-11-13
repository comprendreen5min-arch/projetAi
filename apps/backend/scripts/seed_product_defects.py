import io
from pathlib import Path
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.transformation import Transformation
from app.services.parquet_service import parquet_service
from app.services.lineage_service import lineage_service


def seed_product_defects():
    db = SessionLocal()
    dataset_name = "product_defects/"
    existing = db.query(Dataset).filter(Dataset.name == dataset_name).first()
    if existing:
        print(f"Dataset '{dataset_name}' already exists.")
        return

    # Create index dataframe representing the 12,480 images
    # Classes: ok: 3,720, scratch: 2,410, dent: 1,980, stain: 1,640, misaligned: 1,200, crack: 410, unlabeled: 1,120
    rows = []
    classes_dist = [
        ("ok", 3720),
        ("scratch", 2410),
        ("dent", 1980),
        ("stain", 1640),
        ("misaligned", 1200),
        ("crack", 410),
        ("unlabeled", 1120),
    ]
    idx = 1
    for cls_name, count in classes_dist:
        for i in range(count):
            rows.append({
                "image_id": f"IMG-{idx:06d}",
                "filename": f"{cls_name}_{i+1:05d}.jpg",
                "class": cls_name if cls_name != "unlabeled" else None,
                "format": "JPG" if (i % 5 != 0) else "PNG",
                "width": 1920 if (i % 7 != 0) else 1280,
                "height": 1080 if (i % 7 != 0) else 720,
                "is_corrupted": (i == 0 and cls_name == "crack"),
                "is_blurry": (i < 30 and cls_name == "ok"),
                "is_too_dark": (i < 50 and cls_name == "scratch"),
                "is_overexposed": (i < 15 and cls_name == "dent"),
            })
            idx += 1

    df = pd.DataFrame(rows)
    table = pa.Table.from_pandas(df)
    buf = io.BytesIO()
    pq.write_table(table, buf, compression="snappy")
    parquet_bytes = buf.getvalue()
    metadata = parquet_service.extract_table_metadata(table)

    dataset = Dataset(
        name=dataset_name,
        description="Dataset d'images industrielles pour la détection de défauts (ok, scratch, dent, stain, misaligned, crack)",
    )
    db.add(dataset)
    db.flush()

    data_hash = parquet_service.calculate_bytes_hash(parquet_bytes)
    version_hash = lineage_service.generate_version_hash(
        dataset_id=dataset.id,
        parent_version_hash=None,
        transformation_name="IMAGE_INGESTION",
        parameters={"folder": "product_defects/", "format": "JPG/PNG", "images_count": len(df)},
        data_hash=data_hash,
    )

    storage_dir = Path("/app/storage/datasets") / str(dataset.id)
    storage_dir.mkdir(parents=True, exist_ok=True)
    target_path = storage_dir / f"{version_hash}.parquet"
    target_path.write_bytes(parquet_bytes)

    version = DatasetVersion(
        dataset_id=dataset.id,
        version_hash=version_hash,
        parent_version_id=None,
        storage_path=str(target_path),
        row_count=len(df),
        size_bytes=int(3.8 * 1024 * 1024 * 1024),  # 3.8 GB
        schema_metadata=metadata,
        is_draft=False,
    )
    db.add(version)
    db.flush()

    trans = Transformation(
        target_version_id=version.id,
        name="IMAGE_INGESTION",
        parameters={"folder": "product_defects/", "format": "JPG/PNG", "images_count": len(df)},
        execution_time_ms=250,
    )
    db.add(trans)

    dataset.current_version_id = version.id
    dataset.baseline_version_id = version.id
    db.commit()
    print(f"Dataset '{dataset_name}' seeded successfully with {len(df)} images.")


if __name__ == "__main__":
    seed_product_defects()

