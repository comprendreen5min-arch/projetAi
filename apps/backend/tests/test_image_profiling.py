import io
import zipfile
from pathlib import Path
import pytest
from PIL import Image
from sqlalchemy.orm import Session
from app.services.image_profiling_service import image_profiling_service
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.services.lineage_service import lineage_service


def test_image_profiling_template_profile(db_session: Session):
    """
    Verifies that Image Profiling on product_defects/ exactly returns the template specifications:
    - 12,480 images, 6 classes, formats JPG · PNG, size 3.8 GB
    - Health score 68 with 5 segmented bars
    - 5 findings by impact
    - Contact sheet with 5 flagged frames
    - 6 classes with counts and proportions
    - Sizes and boxes: 1920x1080, 7 sizes, 2.4 boxes/img, 1,120 unlabeled
    """
    # Create dataset product_defects/ in test db
    dataset = Dataset(name="product_defects/", description="Defect detection dataset")
    db_session.add(dataset)
    db_session.flush()

    version = DatasetVersion(
        dataset_id=dataset.id,
        version_hash="template_image_v1",
        parent_version_id=None,
        storage_path="/app/storage/datasets/product_defects.parquet",
        row_count=12480,
        size_bytes=int(3.8 * 1024 * 1024 * 1024),
        is_draft=False,
    )
    db_session.add(version)
    dataset.current_version_id = version.id
    db_session.commit()

    profile = image_profiling_service.profile_dataset(str(dataset.id), db_session)

    # 1. Header KPIs
    assert profile["kpis"]["images"] == "12,480"
    assert profile["kpis"]["classes"] == 6
    assert profile["kpis"]["formats"] == "JPG · PNG"
    assert profile["kpis"]["size"] == "3.8 GB"

    # 2. Health score
    assert profile["health"]["score"] == 68
    assert len(profile["health"]["bars"]) == 5
    health_dict = {b["label"]: b["pct"] for b in profile["health"]["bars"]}
    assert health_dict["Readability"] == 99
    assert health_dict["Uniqueness"] == 93
    assert health_dict["Image quality"] == 82
    assert health_dict["Label coverage"] == 91
    assert health_dict["Class balance"] == 38

    # 3. Findings
    assert len(profile["findings"]) == 5
    titles = [f["title"] for f in profile["findings"]]
    assert "Classes are imbalanced" in titles
    assert "1,120 images have no labels" in titles
    assert "612 near-duplicate images" in titles
    assert "662 low-quality images" in titles
    assert "37 corrupted files" in titles

    # 4. Contact sheet
    assert len(profile["contact_sheet"]) == 5
    cs_dict = {item["type"]: item["count"] for item in profile["contact_sheet"]}
    assert cs_dict["BLURRY"] == 244
    assert cs_dict["TOO DARK"] == 418
    assert cs_dict["OVEREXPOSED"] == 96
    assert cs_dict["NEAR-DUPLICATE"] == 612
    assert cs_dict["CORRUPTED"] == 37
    for item in profile["contact_sheet"]:
        assert "thumbnail_url" in item
        assert item["thumbnail_url"].startswith("data:image/jpeg;base64,")

    # 5. Classes
    assert profile["classes"]["total_count"] == 6
    cls_dict = {c["name"]: c["count"] for c in profile["classes"]["bars"]}
    assert cls_dict["ok"] == 3720
    assert cls_dict["scratch"] == 2410
    assert cls_dict["dent"] == 1980
    assert cls_dict["stain"] == 1640
    assert cls_dict["misaligned"] == 1200
    assert cls_dict["crack"] == 410
    assert "crack has 9× fewer images than ok." in profile["classes"]["footnote"]

    # 6. Sizes and boxes
    sb = profile["sizes_and_boxes"]
    assert sb["most_common_size"] == "1920 × 1080"
    assert sb["different_sizes"] == 7
    assert sb["boxes_per_image"] == 2.4
    assert sb["unlabeled"] == "1,120"
    box_sizes = {b["label"]: b["pct"] for b in sb["box_sizes"]}
    assert box_sizes["SMALL"] == 46
    assert box_sizes["MEDIUM"] == 38
    assert box_sizes["LARGE"] == 16


def test_image_archive_upload_and_dynamic_profiling(db_session: Session):
    """
    Tests uploading a ZIP archive of images and verifies dynamic profiling calculations.
    """
    # Create an in-memory ZIP with 3 sample images
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        # Image 1: ok / normal
        im1 = Image.new("RGB", (640, 480), color=(128, 128, 128))
        im1_bytes = io.BytesIO()
        im1.save(im1_bytes, format="JPEG")
        zf.writestr("ok/sample1.jpg", im1_bytes.getvalue())

        # Image 2: dark
        im2 = Image.new("RGB", (640, 480), color=(10, 10, 10))
        im2_bytes = io.BytesIO()
        im2.save(im2_bytes, format="PNG")
        zf.writestr("scratch/sample2.png", im2_bytes.getvalue())

        # Image 3: overexposed
        im3 = Image.new("RGB", (800, 600), color=(250, 250, 250))
        im3_bytes = io.BytesIO()
        im3.save(im3_bytes, format="JPEG")
        zf.writestr("dent/sample3.jpg", im3_bytes.getvalue())

    zip_bytes = buf.getvalue()

    profile = image_profiling_service.upload_image_archive(
        file_bytes=zip_bytes,
        filename="test_dataset.zip",
        db=db_session,
        dataset_name="test_dataset_images",
    )

    assert profile["kpis"]["images"] == "3"
    assert profile["kpis"]["classes"] >= 2
    assert len(profile["health"]["bars"]) == 5
    assert len(profile["contact_sheet"]) == 5
    for item in profile["contact_sheet"]:
        assert "thumbnail_url" in item
        assert item["thumbnail_url"].startswith("data:image/jpeg;base64,")
    assert profile["sizes_and_boxes"]["most_common_size"] in ["640 × 480", "800 × 600"]
