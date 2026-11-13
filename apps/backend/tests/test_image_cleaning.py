import pytest
from sqlalchemy.orm import Session
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.services.image_cleaning_service import image_cleaning_service


def test_image_cleaning_template_recipe(db_session: Session):
    """
    Verifies that Image Cleaning on product_defects/ exactly returns the template specifications:
    - 11,838 images (was 12,480), classes 6, images fixed 418, output v2
    - Health score before 68 -> after 83
    - 7 steps with exact titles, params, counts and statuses
    - Visual preview pairs with before/after labels and image thumbnails
    - Quality impact bars: Readability, Uniqueness, Image quality, Label coverage, Class balance
    """
    dataset = Dataset(name="product_defects/", description="Product defects image dataset")
    db_session.add(dataset)
    db_session.flush()

    version = DatasetVersion(
        dataset_id=dataset.id,
        version_hash="v1_raw_img_defects",
        parent_version_id=None,
        storage_path="/app/storage/datasets/product_defects.parquet",
        row_count=12480,
        size_bytes=int(3.8 * 1024 * 1024 * 1024),
        is_draft=False,
    )
    db_session.add(version)
    dataset.current_version_id = version.id
    db_session.commit()

    recipe = image_cleaning_service.get_cleaning_recipe(str(dataset.id), db_session)

    # 1. Header KPIs
    assert recipe["kpis"]["images"] == "11,838"
    assert recipe["kpis"]["images_was"] == "was 12,480"
    assert recipe["kpis"]["classes"] == 6
    assert recipe["kpis"]["images_fixed"] == "418"
    assert "3.3%" in recipe["kpis"]["images_fixed_sub"]
    assert recipe["kpis"]["output"] == "v2"

    # 2. Health score
    assert recipe["health"]["before"] == 68
    assert recipe["health"]["after"] == 83

    # 3. Steps list
    assert len(recipe["steps"]) == 7
    steps_dict = {s["id"]: s for s in recipe["steps"]}

    s1 = steps_dict["remove_corrupted"]
    assert s1["rank"] == "01"
    assert "37" in s1["title"]
    assert s1["param_label"] == "ACTION"
    assert s1["param_value"] == "Move to quarantine"
    assert s1["count_label"] == "-37 images"

    s2 = steps_dict["remove_duplicates"]
    assert s2["rank"] == "02"
    assert "near-duplicate" in s2["title"]
    assert s2["param_label"] == "KEEP"
    assert s2["param_value"] == "The sharpest"
    assert s2["count_label"] == "-361 images"

    s3 = steps_dict["brighten_dark"]
    assert s3["rank"] == "03"
    assert "418" in s3["title"]
    assert s3["param_label"] == "METHOD"
    assert s3["param_value"] == "Auto · CLAHE"
    assert s3["count_label"] == "418 images"
    assert s3["status"] == "Previewing"

    s4 = steps_dict["exclude_blurry"]
    assert s4["rank"] == "04"
    assert "244" in s4["title"]
    assert s4["param_label"] == "THRESHOLD"
    assert s4["param_value"] == "Score < 80"
    assert s4["count_label"] == "-244 images"

    s5 = steps_dict["standardize_sizes"]
    assert s5["rank"] == "05"
    assert "Standardize" in s5["title"]
    assert s5["param_label"] == "TARGET"
    assert s5["param_value"] == "1280 px · letterbox"
    assert s5["count_label"] == "All images"

    s6 = steps_dict["label_unlabeled"]
    assert s6["rank"] == "06"
    assert s6["is_later"] is True
    assert s6["param_label"] == "HANDLED IN"
    assert s6["param_value"] == "05 Labeling"

    s7 = steps_dict["balance_classes"]
    assert s7["rank"] == "07"
    assert s7["is_later"] is True
    assert s7["param_label"] == "HANDLED IN"
    assert s7["param_value"] == "03 Augmentation"

    # 4. Previews
    assert "brighten_dark" in recipe["previews"]
    bd_preview = recipe["previews"]["brighten_dark"]
    assert len(bd_preview["pairs"]) >= 3
    for pair in bd_preview["pairs"]:
        assert "before_img" in pair and pair["before_img"].startswith("data:image/jpeg;base64,")
        assert "after_img" in pair and pair["after_img"].startswith("data:image/jpeg;base64,")
    assert "52 images stay too dark" in bd_preview["footnote"]

    # 5. Quality impact
    qi = recipe["quality_impact"]
    assert qi["readability"]["before"] == 99 and qi["readability"]["after"] == 100
    assert qi["uniqueness"]["before"] == 93 and qi["uniqueness"]["after"] == 98
    assert qi["image_quality"]["before"] == 82 and qi["image_quality"]["after"] == 95
    assert qi["label_coverage"]["value"] == 91
    assert qi["class_balance"]["value"] == 38


def test_image_cleaning_apply_recipe(db_session: Session, tmp_path):
    """
    Tests applying image cleaning recipe on custom images dataset.
    """
    data = [
        {"image_name": "img_001.jpg", "corrupted": False, "is_blurry": False, "is_too_dark": True, "class": "ok"},
        {"image_name": "img_002.jpg", "corrupted": True, "is_blurry": False, "is_too_dark": False, "class": "ok"},
        {"image_name": "img_003.jpg", "corrupted": False, "is_blurry": True, "is_too_dark": False, "class": "ok"},
        {"image_name": "img_004.jpg", "corrupted": False, "is_blurry": False, "is_too_dark": False, "class": "ok"},
    ]
    df = pd.DataFrame(data)
    parquet_path = tmp_path / "custom_images.parquet"
    table = pa.Table.from_pandas(df)
    pq.write_table(table, str(parquet_path))

    dataset = Dataset(name="custom_inspection_set/", description="Custom inspection images")
    db_session.add(dataset)
    db_session.flush()

    v1 = DatasetVersion(
        dataset_id=dataset.id,
        version_hash="custom_img_v1",
        storage_path=str(parquet_path),
        row_count=len(df),
        size_bytes=parquet_path.stat().st_size,
        is_draft=False,
    )
    db_session.add(v1)
    dataset.current_version_id = v1.id
    db_session.commit()

    res = image_cleaning_service.apply_cleaning_recipe(
        dataset_id=str(dataset.id),
        payload={
            "enabled_steps": ["remove_corrupted", "exclude_blurry"],
            "parameters": {},
        },
        db=db_session,
    )

    assert res["applied"] is True
    assert res["new_version_hash"] is not None

    new_version = db_session.query(DatasetVersion).filter(
        DatasetVersion.dataset_id == dataset.id,
        DatasetVersion.version_hash == res["new_version_hash"]
    ).first()
    assert new_version is not None
    # 4 images - 1 corrupted - 1 blurry = 2 images remain
    assert new_version.row_count == 2

