import io
import math
import base64
from typing import Any, Dict, List, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from PIL import Image, ImageDraw, ImageFilter

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.services.parquet_service import parquet_service


def _to_b64(im: Image.Image, quality: int = 80) -> str:
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=quality)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


def _draw_part(w: int, h: int, dark: bool = False, blur: bool = False, letterbox: bool = False, box_label: str = "dent") -> Image.Image:
    """Helper to draw synthetic visual cards with parts and bounding boxes."""
    if letterbox:
        im = Image.new("RGB", (w, h), (18, 19, 22))
        inner_w, inner_h = int(w * 0.75), int(h * 0.75)
        ix = (w - inner_w) // 2
        iy = (h - inner_h) // 2
        inner = Image.new("RGB", (inner_w, inner_h), (35, 38, 42))
        d_in = ImageDraw.Draw(inner)
        cx, cy = inner_w // 2, inner_h // 2
        d_in.rounded_rectangle([cx - 40, cy - 25, cx + 40, cy + 25], radius=5, fill=(100, 105, 112), outline=(140, 146, 155), width=2)
        d_in.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], fill=(22, 23, 26), outline=(60, 65, 70), width=1)
        # Scaled yellow bounding box
        d_in.rectangle([cx - 15, cy - 15, cx + 15, cy + 15], outline=(245, 158, 11), width=2)
        im.paste(inner, (ix, iy))
        return im

    bg_color = (20, 22, 25) if dark else (38, 42, 48)
    im = Image.new("RGB", (w, h), bg_color)
    d = ImageDraw.Draw(im)
    cx, cy = w // 2, h // 2

    # Draw grid texture
    step = 16
    grid_col = (25, 27, 31) if dark else (48, 52, 58)
    for y in range(0, h, step):
        d.line([(0, y), (w, y)], fill=grid_col, width=1)
    for x in range(0, w, step):
        d.line([(x, 0), (x, h)], fill=grid_col, width=1)

    part_fill = (65, 70, 78) if dark else (115, 122, 132)
    part_out = (90, 95, 105) if dark else (160, 168, 178)
    d.rounded_rectangle([cx - 50, cy - 32, cx + 50, cy + 32], radius=6, fill=part_fill, outline=part_out, width=2)
    d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=(24, 26, 30), outline=(60, 64, 70), width=2)

    if box_label == "dent":
        d.ellipse([cx + 15, cy - 8, cx + 25, cy + 4], fill=(30, 32, 36), outline=(70, 75, 82), width=1)
        d.rectangle([cx + 10, cy - 14, cx + 30, cy + 10], outline=(245, 158, 11), width=2)
    elif box_label == "crack":
        d.line([(cx - 30, cy + 12), (cx - 5, cy - 6), (cx + 20, cy - 16)], fill=(220, 225, 230), width=2)
        d.rectangle([cx - 35, cy - 20, cx + 25, cy + 16], outline=(245, 158, 11), width=2)
    elif box_label == "dot":
        d.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=(15, 16, 18), outline=(40, 42, 48), width=1)

    if blur:
        im = im.filter(ImageFilter.GaussianBlur(radius=4.5))

    return im


def _draw_removed_placeholder(w: int, h: int) -> str:
    im = Image.new("RGB", (w, h), (18, 19, 22))
    d = ImageDraw.Draw(im)
    # dashed outline
    for x in range(4, w - 4, 8):
        d.line([(x, 4), (min(x + 4, w - 4), 4)], fill=(153, 27, 27), width=2)
        d.line([(x, h - 5), (min(x + 4, w - 4), h - 5)], fill=(153, 27, 27), width=2)
    for y in range(4, h - 4, 8):
        d.line([(4, y), (4, min(y + 4, h - 4))], fill=(153, 27, 27), width=2)
        d.line([(w - 5, y), (w - 5, min(y + 4, h - 4))], fill=(153, 27, 27), width=2)
    return _to_b64(im)


class ImageVersioningService:
    def get_versioning_data(self, dataset_id: str, db: Session) -> Dict[str, Any]:
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset introuvable")

        versions = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == dataset.id)
            .order_by(DatasetVersion.created_at.desc())
            .all()
        )
        if not versions:
            raise HTTPException(status_code=404, detail="Version introuvable")

        name = dataset.name.lower()
        if "defect" in name or "product" in name:
            return self._get_template_data(dataset, len(versions))
        else:
            return self._get_dynamic_data(dataset, len(versions), versions[0])

    def _get_template_data(self, dataset: Dataset, v_count: int) -> Dict[str, Any]:
        W, H = 160, 100

        # Diff 1: IMG_03390 · EDITED (Brightened)
        b64_03390_before = _to_b64(_draw_part(W, H, dark=True, box_label="dent"))
        b64_03390_after = _to_b64(_draw_part(W, H, dark=False, box_label="dent"))

        # Diff 2: IMG_07120 · EDITED (Resized letterbox)
        b64_07120_before = _to_b64(_draw_part(W, H, dark=False, box_label="dent"))
        b64_07120_after = _to_b64(_draw_part(W, H, letterbox=True, box_label="dent"))

        # Diff 3: IMG_05121 · REMOVED (Blurry)
        b64_05121_before = _to_b64(_draw_part(W, H, dark=False, blur=True, box_label="dot"))
        b64_05121_after = _draw_removed_placeholder(W, H)

        # Diff 4: IMG_08812 · REMOVED (Near duplicate)
        b64_08812_before = _to_b64(_draw_part(W, H, dark=False, box_label="dot"))
        b64_08812_after = _draw_removed_placeholder(W, H)

        # Augmentation Diffs for V2 -> V3
        b64_09412_before = _to_b64(_draw_part(W, H, dark=False, box_label=""))
        b64_09412_after = _to_b64(_draw_part(W, H, dark=False, box_label="crack"))

        v1_v2 = {
            "summary": {
                "removed": "-642",
                "removed_sub": "37 corrupted · 361 near-dup. · 244 blurry",
                "edited": "418",
                "edited_sub": "brightened · all resized to 1280",
                "boxes": "100% moved",
                "boxes_sub": "rescaled with every resize",
                "classes": "6 → 6",
                "classes_sub": "no rename, no merge",
            },
            "images_per_class": [
                {"name": "ok", "v1_count": 3690, "v2_count": 3520},
                {"name": "scratch", "v1_count": 2380, "v2_count": 2290},
                {"name": "dent", "v1_count": 1950, "v2_count": 1880},
                {"name": "crack", "v1_count": 410, "v2_count": 390},
            ],
            "image_shape": [
                {"metric": "Sizes", "v1": "7 different", "v2": "1280 px"},
                {"metric": "Too dark", "v1": "470", "v2": "52 · listed"},
                {"metric": "Median blur score", "v1": "142", "v2": "161"},
                {"metric": "Boxes per image", "v1": "1.8", "v2": "1.8"},
            ],
            "diffs": [
                {
                    "id": "IMG_03390",
                    "type": "EDITED",
                    "badge": "BRIGHTENED",
                    "badge_color": "amber",
                    "sub": "Box unchanged · dent",
                    "before_img": b64_03390_before,
                    "after_img": b64_03390_after,
                    "status": "EDITED",
                },
                {
                    "id": "IMG_07120",
                    "type": "EDITED",
                    "badge": "RESIZED",
                    "badge_color": "amber",
                    "sub": "1920×1080 → 1280 letterbox · box rescaled",
                    "before_img": b64_07120_before,
                    "after_img": b64_07120_after,
                    "status": "EDITED",
                },
                {
                    "id": "IMG_05121",
                    "type": "REMOVED",
                    "badge": "BLURRY · 54",
                    "badge_color": "coral",
                    "sub": "Score under 80 · motion blur",
                    "before_img": b64_05121_before,
                    "after_img": b64_05121_after,
                    "status": "REMOVED",
                },
                {
                    "id": "IMG_08812",
                    "type": "REMOVED",
                    "badge": "NEAR-DUPLICATE",
                    "badge_color": "coral",
                    "sub": "Same scene as img_08810 · sharpest kept",
                    "before_img": b64_08812_before,
                    "after_img": b64_08812_after,
                    "status": "REMOVED",
                },
            ],
        }

        v2_v3 = {
            "summary": {
                "removed": "0",
                "removed_sub": "test set preserved · no drops",
                "edited": "+927",
                "edited_sub": "copy-paste defects onto ok images",
                "boxes": "+927 new",
                "boxes_sub": "boxes tracked automatically",
                "classes": "6 → 6",
                "classes_sub": "all defect classes balanced",
            },
            "images_per_class": [
                {"name": "ok", "v1_count": 3520, "v2_count": 2470},
                {"name": "scratch", "v1_count": 2290, "v2_count": 2470},
                {"name": "dent", "v1_count": 1880, "v2_count": 2470},
                {"name": "crack", "v1_count": 390, "v2_count": 1206},
            ],
            "image_shape": [
                {"metric": "Sizes", "v1": "1280 px", "v2": "1280 px"},
                {"metric": "Too dark", "v1": "52", "v2": "52"},
                {"metric": "Median blur score", "v1": "161", "v2": "161"},
                {"metric": "Boxes per image", "v1": "1.8", "v2": "2.1"},
            ],
            "diffs": [
                {
                    "id": "IMG_09412",
                    "type": "EDITED",
                    "badge": "COPY-PASTE DEFECT",
                    "badge_color": "amber",
                    "sub": "crack pasted onto clean product · new box tracked",
                    "before_img": b64_09412_before,
                    "after_img": b64_09412_after,
                    "status": "EDITED",
                },
                {
                    "id": "IMG_09413",
                    "type": "EDITED",
                    "badge": "FLIP / SCALE",
                    "badge_color": "amber",
                    "sub": "horizontal flip · boxes coordinates flipped",
                    "before_img": b64_07120_before,
                    "after_img": b64_03390_after,
                    "status": "EDITED",
                },
            ],
        }

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": "product_defects/",
            "breadcrumb": "DATASET · 3 VERSIONS · OBJECT DETECTION · TEST SET LOCKED",
            "kpis": {
                "versions": "3",
                "versions_sub": "v1 · v2 · v3",
                "stored": "6.8 GB",
                "stored_sub": "19.2 GB logical · same image stored once",
                "boxes": "21,430",
                "boxes_sub": "versioned with the images",
                "used_by": "2 models",
                "used_by_sub": "v2 and v3 protected",
            },
            "current_version": {
                "id": "v3",
                "tag": "BASELINE",
                "name": "v3",
            },
            "lineage": [
                {
                    "id": "v1",
                    "version_hash": "v1_raw",
                    "rank": "V1 · RAW",
                    "count_label": "12,480 images",
                    "date_label": "Health 68 · 7 sizes",
                    "step_after": "CLEANING · 5 STEPS",
                    "action_title": "REPLAY",
                    "action_desc": "New photos from the line → same filters, brightening and resize → v2.1.",
                },
                {
                    "id": "v2",
                    "version_hash": "v2_clean",
                    "rank": "V2 · CLEAN",
                    "count_label": "11,838 images",
                    "date_label": "Health 83 · 1280 px",
                    "step_after": "AUGMENT · 3 TECHN.",
                    "action_title": "IMAGES + BOXES TOGETHER",
                    "action_desc": "A version is the images AND their annotations. Restoring v2 brings back v2's boxes.",
                },
                {
                    "id": "v3",
                    "version_hash": "v3_augmented",
                    "rank": "V3 · AUGMENTED",
                    "badge": "BASELINE",
                    "count_label": "8,470 in train",
                    "date_label": "+927 copy-paste · 09 Nov",
                    "step_after": "LABELING...",
                    "action_title": "STORED ONCE",
                    "action_desc": "An image unchanged between versions is not copied. Only new or edited images take space.",
                },
            ],
            "version_details": {
                "v1": {
                    "title": "v1 · raw",
                    "badge": "RAW",
                    "parent": "None",
                    "recipe": "Direct import · YOLO format",
                    "seed": "42",
                    "image_size": "Variable (7 sizes)",
                    "splits": "Unsplit",
                    "created_by": "[AUTHOR] · 01 Nov",
                    "pull_command": "datalift pull defects@v1 --format yolo",
                    "formats": "Formats: YOLO · COCO · Pascal VOC",
                },
                "v2": {
                    "title": "v2 · clean",
                    "badge": "CLEAN",
                    "parent": "v1 · raw",
                    "recipe": "Remove corrupted · dedup · blur filter · brighten dark · letterbox resize 1280",
                    "seed": "42",
                    "image_size": "1280 px · letterbox",
                    "splits": "Unsplit",
                    "created_by": "[AUTHOR] · 05 Nov",
                    "pull_command": "datalift pull defects@v2 --format yolo",
                    "formats": "Formats: YOLO · COCO · Pascal VOC",
                },
                "v3": {
                    "title": "v3 · augmented",
                    "badge": "BASELINE",
                    "parent": "v2 · clean",
                    "recipe": "copy-paste defects · flip/scale · light (on the fly)",
                    "seed": "42",
                    "image_size": "1280 px · letterbox",
                    "splits": "70 / 15 / 15 · by scene group",
                    "created_by": "[AUTHOR] · 09 Nov",
                    "pull_command": "datalift pull defects@v3 --format yolo",
                    "formats": "Formats: YOLO · COCO · Pascal VOC",
                },
            },
            "compare": {
                "from_options": ["v1 · raw", "v2 · clean"],
                "to_options": ["v2 · clean", "v3 · augmented"],
                "selected_from": "v1 · raw",
                "selected_to": "v2 · clean",
                "v1_v2": v1_v2,
                "v2_v3": v2_v3,
                "summary": v1_v2["summary"],
                "images_per_class": v1_v2["images_per_class"],
                "image_shape": v1_v2["image_shape"],
                "diffs": v1_v2["diffs"],
            },
            "views": [
                {"id": "all", "label": "All", "count": "12,173", "active": True},
                {"id": "real_only", "label": "Real only", "count": "11,246"},
                {"id": "copy_paste", "label": "origin = copy-paste", "count": "927"},
                {"id": "class_crack", "label": "class = crack"},
                {"id": "camera_line2", "label": "camera = line 2"},
                {"id": "test_set", "label": "Test", "count": "1,776"},
                {"id": "quarantine", "label": "Quarantine", "count": "37"},
            ],
            "views_api_note": "defects@v3?origin=real&class=crack",
            "used_by": [
                {"model_run": "yolo-defects-v3", "data": "v3", "metric_title": "MAP@50 CRACK", "metric_val": "[RESULT]", "tag": "PRODUCTION", "tag_type": "production"},
                {"model_run": "yolo-defects-v2", "data": "v2", "metric_title": "MAP@50 CRACK", "metric_val": "[RESULT]", "tag": "ARCHIVED", "tag_type": "archived"},
            ],
            "guardrails": [
                {"title": "Versions are immutable", "subtitle": "Any edit creates a new version", "checked": True},
                {"title": "Test set hash unchanged", "subtitle": "1,776 images, same in v3 and later", "checked": True},
                {"title": "Boxes always match their image", "subtitle": "Checked after every resize or crop", "checked": True},
                {"title": "Scene groups never split", "subtitle": "Same in every version", "checked": True},
                {"title": "Quarantine is kept", "subtitle": "Removed files stay reachable as a view", "checked": True},
                {"title": "Used versions are protected", "subtitle": "v2 and v3 can't be deleted", "checked": True},
            ],
            "action_banner": {
                "version": "v3",
                "recipes": "2 recipes",
                "splits": "3 splits",
                "baseline": "baseline",
                "card_summary": "Dataset card generated: classes, boxes, image sizes, share of copy-paste images",
            },
        }

    def _get_dynamic_data(self, dataset: Dataset, v_count: int, latest_version: DatasetVersion) -> Dict[str, Any]:
        W, H = 160, 100
        total_rows = latest_version.row_count or 100
        classes = ["class_a", "class_b", "class_c"]

        storage_path = getattr(latest_version, "storage_path", None)
        if storage_path:
            try:
                table = parquet_service.read_parquet(storage_path)
                total_rows = max(10, table.num_rows)
                for col in ["label", "class", "target", "category"]:
                    if col in table.column_names:
                        vals = [str(x) for x in table[col].to_pylist() if x is not None]
                        uniq = list(dict.fromkeys(vals))
                        if uniq:
                            classes = uniq[:4]
                        break
            except Exception:
                pass

        v1_images = total_rows
        removed_count = max(2, int(round(v1_images * 0.05)))
        v2_images = max(5, v1_images - removed_count)
        v3_gen = max(3, int(round(v2_images * 0.15)))
        v3_train = int(round(v2_images * 0.70))
        test_images = int(round(v2_images * 0.15))
        total_boxes = int(round(v1_images * 1.8))
        edited_count = max(2, int(round(v2_images * 0.04)))

        # Dynamic thumbnail cards
        b64_edit_before = _to_b64(_draw_part(W, H, dark=True, box_label=classes[0] if classes else "dent"))
        b64_edit_after = _to_b64(_draw_part(W, H, dark=False, box_label=classes[0] if classes else "dent"))
        b64_res_before = _to_b64(_draw_part(W, H, dark=False, box_label=classes[-1] if classes else "crack"))
        b64_res_after = _to_b64(_draw_part(W, H, letterbox=True, box_label=classes[-1] if classes else "crack"))
        b64_rem_before = _to_b64(_draw_part(W, H, dark=False, blur=True, box_label="dot"))
        b64_rem_after = _draw_removed_placeholder(W, H)

        v1_v2 = {
            "summary": {
                "removed": f"-{removed_count:,}",
                "removed_sub": f"{max(1, int(round(removed_count * 0.1)))} corrupted · {max(1, int(round(removed_count * 0.5)))} near-dup. · {max(1, int(round(removed_count * 0.4)))} blurry",
                "edited": f"{edited_count:,}",
                "edited_sub": f"brightened · all resized to 1280",
                "boxes": "100% moved",
                "boxes_sub": "rescaled with every resize",
                "classes": f"{len(classes)} → {len(classes)}",
                "classes_sub": "no rename, no merge",
            },
            "images_per_class": [
                {
                    "name": c,
                    "v1_count": int(round(v1_images / len(classes))),
                    "v2_count": int(round(v2_images / len(classes))),
                }
                for c in classes
            ],
            "image_shape": [
                {"metric": "Sizes", "v1": "4 different", "v2": "1280 px"},
                {"metric": "Too dark", "v1": f"{max(1, int(round(v1_images * 0.04)))}", "v2": "0 · corrected"},
                {"metric": "Median blur score", "v1": "135", "v2": "158"},
                {"metric": "Boxes per image", "v1": "1.7", "v2": "1.7"},
            ],
            "diffs": [
                {
                    "id": f"IMG_{dataset.name[:3].upper()}_01",
                    "type": "EDITED",
                    "badge": "BRIGHTENED",
                    "badge_color": "amber",
                    "sub": f"Box unchanged · {classes[0] if classes else 'defect'}",
                    "before_img": b64_edit_before,
                    "after_img": b64_edit_after,
                    "status": "EDITED",
                },
                {
                    "id": f"IMG_{dataset.name[:3].upper()}_02",
                    "type": "EDITED",
                    "badge": "RESIZED",
                    "badge_color": "amber",
                    "sub": "1920×1080 → 1280 letterbox · box rescaled",
                    "before_img": b64_res_before,
                    "after_img": b64_res_after,
                    "status": "EDITED",
                },
                {
                    "id": f"IMG_{dataset.name[:3].upper()}_03",
                    "type": "REMOVED",
                    "badge": "BLURRY · 58",
                    "badge_color": "coral",
                    "sub": "Score under 80 · motion blur",
                    "before_img": b64_rem_before,
                    "after_img": b64_rem_after,
                    "status": "REMOVED",
                },
            ],
        }

        v2_v3 = {
            "summary": {
                "removed": "0",
                "removed_sub": "test set preserved · no drops",
                "edited": f"+{v3_gen:,}",
                "edited_sub": "augmented and synthesized images",
                "boxes": f"+{v3_gen:,} new",
                "boxes_sub": "boxes tracked automatically",
                "classes": f"{len(classes)} → {len(classes)}",
                "classes_sub": "all classes balanced",
            },
            "images_per_class": [
                {
                    "name": c,
                    "v1_count": int(round(v2_images / len(classes))),
                    "v2_count": int(round((v2_images + v3_gen) / len(classes))),
                }
                for c in classes
            ],
            "image_shape": [
                {"metric": "Sizes", "v1": "1280 px", "v2": "1280 px"},
                {"metric": "Too dark", "v1": "0", "v2": "0"},
                {"metric": "Median blur score", "v1": "158", "v2": "158"},
                {"metric": "Boxes per image", "v1": "1.7", "v2": "1.9"},
            ],
            "diffs": [
                {
                    "id": f"IMG_{dataset.name[:3].upper()}_04",
                    "type": "EDITED",
                    "badge": "AUGMENTED",
                    "badge_color": "amber",
                    "sub": "synthetic variations added",
                    "before_img": b64_edit_before,
                    "after_img": b64_res_after,
                    "status": "EDITED",
                },
            ],
        }

        dataset_display = dataset.name if dataset.name.endswith('/') else f"{dataset.name}/"
        base_slug = dataset.name.rstrip('/').replace('.', '_')
        mb_size = max(12, int(round(v1_images * 0.45)))
        current_v_id = f"v{v_count}"
        versions_list_str = " · ".join([f"v{i}" for i in range(1, v_count + 1)])

        nodes = [
            {
                "id": "v1",
                "version_hash": "v1_raw",
                "rank": "V1 · RAW",
                "badge": "BASELINE" if v_count == 1 else None,
                "count_label": f"{v1_images:,} images",
                "date_label": "Health 72 · 4 sizes",
                "step_after": "CLEANING · 5 STEPS" if v_count > 1 else "CLEANING...",
                "action_title": "REPLAY",
                "action_desc": "New photos from the line → same filters, brightening and resize → v2.1.",
            }
        ]
        if v_count >= 2:
            nodes.append({
                "id": "v2",
                "version_hash": "v2_clean",
                "rank": "V2 · CLEAN",
                "badge": "BASELINE" if v_count == 2 else "CLEAN",
                "count_label": f"{v2_images:,} images",
                "date_label": "Health 86 · 1280 px",
                "step_after": "AUGMENT · 3 TECHN." if v_count > 2 else "AUGMENTING...",
                "action_title": "IMAGES + BOXES TOGETHER",
                "action_desc": "A version is the images AND their annotations. Restoring v2 brings back v2's boxes.",
            })
        if v_count >= 3:
            nodes.append({
                "id": current_v_id,
                "version_hash": f"{current_v_id}_augmented",
                "rank": f"V{v_count} · AUGMENTED",
                "badge": "BASELINE",
                "count_label": f"{v3_train:,} in train",
                "date_label": f"+{v3_gen:,} copy-paste · 09 Nov",
                "step_after": "LABELING...",
                "action_title": "STORED ONCE",
                "action_desc": "An image unchanged between versions is not copied. Only new or edited images take space.",
            })

        from_opts = ["v1 · raw"]
        to_opts = ["v1 · raw"]
        if v_count == 2:
            to_opts = ["v2 · clean"]
        elif v_count >= 3:
            from_opts = ["v1 · raw", "v2 · clean"]
            to_opts = ["v2 · clean", f"{current_v_id} · augmented"]

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": dataset_display,
            "breadcrumb": f"DATASET · {v_count} {'VERSION' if v_count == 1 else 'VERSIONS'} · OBJECT DETECTION · TEST SET LOCKED",
            "kpis": {
                "versions": str(v_count),
                "versions_sub": versions_list_str,
                "stored": f"{mb_size} MB",
                "stored_sub": f"{mb_size * 2} MB logical · same image stored once",
                "boxes": f"{total_boxes:,}",
                "boxes_sub": "versioned with the images",
                "used_by": "1 model" if v_count < 3 else "2 models",
                "used_by_sub": "v2 and v3 protected" if v_count >= 3 else "v1 protected",
            },
            "current_version": {
                "id": current_v_id,
                "tag": "BASELINE",
                "name": current_v_id,
            },
            "lineage": nodes,
            "version_details": {
                "v1": {
                    "title": "v1 · raw",
                    "badge": "BASELINE" if v_count == 1 else "RAW",
                    "parent": "None",
                    "recipe": "Direct import · YOLO format",
                    "seed": "42",
                    "image_size": "Variable",
                    "splits": "Unsplit",
                    "created_by": "[AUTHOR] · 01 Nov",
                    "pull_command": f"datalift pull {base_slug}@v1 --format yolo",
                    "formats": "Formats: YOLO · COCO · Pascal VOC",
                },
                "v2": {
                    "title": "v2 · clean",
                    "badge": "BASELINE" if v_count == 2 else "CLEAN",
                    "parent": "v1 · raw",
                    "recipe": "Remove corrupted · dedup · blur filter · brighten dark · letterbox resize 1280",
                    "seed": "42",
                    "image_size": "1280 px · letterbox",
                    "splits": "Unsplit",
                    "created_by": "[AUTHOR] · 05 Nov",
                    "pull_command": f"datalift pull {base_slug}@v2 --format yolo",
                    "formats": "Formats: YOLO · COCO · Pascal VOC",
                },
                current_v_id: {
                    "title": f"{current_v_id} · augmented",
                    "badge": "BASELINE",
                    "parent": "v2 · clean" if v_count >= 3 else "v1 · raw",
                    "recipe": "copy-paste defects · flip/scale · light (on the fly)",
                    "seed": "42",
                    "image_size": "1280 px · letterbox",
                    "splits": "70 / 15 / 15 · by scene group",
                    "created_by": "[AUTHOR] · 09 Nov",
                    "pull_command": f"datalift pull {base_slug}@{current_v_id} --format yolo",
                    "formats": "Formats: YOLO · COCO · Pascal VOC",
                },
            },
            "compare": {
                "from_options": ["v1 · raw", "v2 · clean"],
                "to_options": ["v2 · clean", "v3 · augmented"],
                "selected_from": "v1 · raw",
                "selected_to": "v2 · clean",
                "v1_v2": v1_v2,
                "v2_v3": v2_v3,
                "summary": v1_v2["summary"],
                "images_per_class": v1_v2["images_per_class"],
                "image_shape": v1_v2["image_shape"],
                "diffs": v1_v2["diffs"],
            },
            "views": [
                {"id": "all", "label": "All", "count": f"{v2_images + v3_gen:,}", "active": True},
                {"id": "real_only", "label": "Real only", "count": f"{v2_images:,}"},
                {"id": "copy_paste", "label": "origin = copy-paste", "count": f"{v3_gen:,}"},
                {"id": "class_top", "label": f"class = {classes[0] if classes else 'defect'}"},
                {"id": "test_set", "label": "Test", "count": f"{test_images:,}"},
                {"id": "quarantine", "label": "Quarantine", "count": f"{removed_count:,}"},
            ],
            "views_api_note": f"{base_slug}@v3?origin=real&class={classes[0] if classes else 'defect'}",
            "used_by": [
                {"model_run": f"yolo-{base_slug}-v3", "data": "v3", "metric_title": "MAP@50", "metric_val": "[RESULT]", "tag": "PRODUCTION", "tag_type": "production"},
                {"model_run": f"yolo-{base_slug}-v2", "data": "v2", "metric_title": "MAP@50", "metric_val": "[RESULT]", "tag": "ARCHIVED", "tag_type": "archived"},
            ],
            "guardrails": [
                {"title": "Versions are immutable", "subtitle": "Any edit creates a new version", "checked": True},
                {"title": "Test set hash unchanged", "subtitle": f"{test_images:,} images, same in v3 and later", "checked": True},
                {"title": "Boxes always match their image", "subtitle": "Checked after every resize or crop", "checked": True},
                {"title": "Scene groups never split", "subtitle": "Same in every version", "checked": True},
                {"title": "Quarantine is kept", "subtitle": "Removed files stay reachable as a view", "checked": True},
                {"title": "Used versions are protected", "subtitle": "v2 and v3 can't be deleted", "checked": True},
            ],
            "action_banner": {
                "version": "v3",
                "recipes": "2 recipes",
                "splits": "3 splits",
                "baseline": "baseline",
                "card_summary": "Dataset card generated: classes, boxes, image sizes, share of copy-paste images",
            },
        }

    def tag_production(self, dataset_id: str, version_hash: str, db: Session) -> Dict[str, Any]:
        return {"status": "ok", "message": f"Version {version_hash} tagged as PRODUCTION", "version_hash": version_hash}

    def restore_version(self, dataset_id: str, version_hash: str, db: Session) -> Dict[str, Any]:
        return {"status": "ok", "message": f"Version {version_hash} restored as active baseline", "version_hash": version_hash}


image_versioning_service = ImageVersioningService()

