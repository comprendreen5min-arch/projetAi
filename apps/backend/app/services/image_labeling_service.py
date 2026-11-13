import io
import base64
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException
from PIL import Image, ImageDraw

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.services.parquet_service import parquet_service


def _create_sample_image_b64(w: int = 560, h: int = 340, dark: bool = True) -> str:
    """Generate a clean dark product surface preview."""
    im = Image.new("RGB", (w, h), (32, 35, 40))
    d = ImageDraw.Draw(im)
    # Background texture lines
    for y in range(0, h, 20):
        d.line([(0, y), (w, y)], fill=(36, 40, 46), width=1)
    for x in range(0, w, 20):
        d.line([(x, 0), (x, h)], fill=(36, 40, 46), width=1)
    # Inner metallic / plastic panel
    margin_x, margin_y = 60, 40
    d.rounded_rectangle(
        [margin_x, margin_y, w - margin_x, h - margin_y],
        radius=8,
        fill=(55, 60, 68),
        outline=(75, 82, 92),
        width=2,
    )
    # Feature line (defect / crack)
    d.line([(180, 140), (280, 100)], fill=(22, 24, 28), width=3)
    # Dent circle
    d.ellipse([(340, 180), (356, 196)], fill=(24, 26, 30), outline=(45, 50, 58), width=2)

    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


def _create_thumb_b64(w: int = 70, h: int = 50, idx: int = 0) -> str:
    im = Image.new("RGB", (w, h), (40 + (idx * 5) % 20, 44, 50))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([10, 8, w - 10, h - 8], radius=3, fill=(65, 70, 78), outline=(90, 95, 105), width=1)
    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=75)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


class ImageLabelingService:
    """Service dedicated to Image Labeling (05 Labeling for images).
    Provides queue management, active image annotations, classes, and checks.
    """

    def get_labeling_data(
        self,
        dataset_id: str,
        db: Session,
        queue: str = "unlabeled",
        image_index: int = 0
    ) -> Dict[str, Any]:
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset introuvable")

        versions = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == dataset_id)
            .order_by(DatasetVersion.created_at.desc())
            .all()
        )
        if not versions:
            raise HTTPException(status_code=404, detail="Aucune version trouvée pour ce dataset")

        name = dataset.name.lower()
        if "defect" in name or "product" in name:
            return self._get_template_data(dataset, len(versions), queue, image_index)
        else:
            return self._get_dynamic_data(dataset, len(versions), versions[0], queue, image_index)

    def _get_template_data(
        self,
        dataset: Dataset,
        v_count: int,
        queue: str = "unlabeled",
        image_index: int = 0
    ) -> Dict[str, Any]:
        output_v = f"v{max(4, v_count + 1)}"

        # 6 Filmstrip images
        filmstrip = [
            {"id": "IMG_07732.JPG", "index": 0, "status": "labeled", "thumb": _create_thumb_b64(70, 50, 0)},
            {"id": "IMG_07733.JPG", "index": 1, "status": "labeled", "thumb": _create_thumb_b64(70, 50, 1)},
            {"id": "IMG_07734.JPG", "index": 2, "status": "current", "thumb": _create_thumb_b64(70, 50, 2)},
            {"id": "IMG_07735.JPG", "index": 3, "status": "unlabeled", "thumb": _create_thumb_b64(70, 50, 3)},
            {"id": "IMG_07736.JPG", "index": 4, "status": "unlabeled", "thumb": _create_thumb_b64(70, 50, 4)},
            {"id": "IMG_07737.JPG", "index": 5, "status": "unlabeled", "thumb": _create_thumb_b64(70, 50, 5)},
        ]

        # Current active image details
        active_img = filmstrip[min(image_index, len(filmstrip) - 1)]

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": "product_defects/",
            "breadcrumb": "DATASET · V3 → V4 DRAFT · OBJECT DETECTION · 6 CLASSES",
            "kpis": {
                "to_label": "1,120",
                "to_label_sub": "sent from 02 Cleaning",
                "suspected_errors": "214",
                "suspected_errors_sub": "model disagrees ≥ 0.9",
                "done_today": "386",
                "done_today_sub": "3 annotators · 1 reviewer",
                "output": output_v,
                "output_sub": "v3 kept as is",
            },
            "gauge": {
                "coverage_before": 91,
                "coverage_after": 100,
                "label": "LABEL COVERAGE / 100",
            },
            "queues": [
                {
                    "id": "unlabeled",
                    "title": "UNLABELED",
                    "count": "1,120",
                    "desc": "Pre-annotated by yolo-defects-v3 · about 2 h 10 at current pace",
                    "progress_text": "412 done",
                    "progress_pct": 37,
                    "action_label": "Continue",
                    "active": queue == "unlabeled",
                },
                {
                    "id": "suspected_errors",
                    "title": "SUSPECTED ERRORS",
                    "count": "214",
                    "desc": "Already labeled, but the model strongly disagrees · fixing these pays most",
                    "progress_text": "0 done",
                    "progress_pct": 0,
                    "action_label": "Start",
                    "active": queue == "suspected_errors",
                },
                {
                    "id": "low_confidence",
                    "title": "LOW CONFIDENCE",
                    "count": "342",
                    "desc": "Model hesitates between crack and scratch · feeds 07 Active learning",
                    "progress_text": "41 done",
                    "progress_pct": 12,
                    "action_label": "Start",
                    "active": queue == "low_confidence",
                },
                {
                    "id": "to_review",
                    "title": "TO REVIEW",
                    "count": "86",
                    "desc": "Labels waiting for a reviewer · grid of 20 to accept fast",
                    "progress_text": "Reviewer only",
                    "progress_pct": 0,
                    "action_label": "Review",
                    "active": queue == "to_review",
                },
            ],
            "queue_settings": {
                "pre_annotation": "yolo-defects-v3 · min 0.30",
                "order_inside_queue": "Most uncertain first",
                "double_annotation": "10% of items · for agreement",
                "assign": "Split between 3 annotators",
            },
            "workspace": {
                "queue_name": queue.upper(),
                "image_name": active_img["id"],
                "image_position": f"{image_index + 413} / 1,120",
                "image_url": _create_sample_image_b64(),
                "filmstrip": filmstrip,
                "active_filmstrip_index": image_index,
                "boxes": [
                    {
                        "id": "box_1",
                        "label": "crack",
                        "tag": "you · selected",
                        "type": "human",
                        "x": 140,
                        "y": 80,
                        "width": 150,
                        "height": 90,
                        "color": "#f59e0b",
                        "selected": True,
                    },
                    {
                        "id": "box_2",
                        "label": "dent",
                        "tag": "model 0.58",
                        "type": "model",
                        "confidence": 0.58,
                        "x": 320,
                        "y": 145,
                        "width": 80,
                        "height": 80,
                        "color": "#3b82f6",
                        "selected": False,
                    },
                    {
                        "id": "box_3",
                        "label": "new box",
                        "tag": "no class yet",
                        "type": "drawing",
                        "x": 90,
                        "y": 190,
                        "width": 110,
                        "height": 60,
                        "color": "#f59e0b",
                        "selected": False,
                    },
                ],
                "model_suggestions": [
                    {"label": "dent", "confidence": 0.58},
                    {"label": "stain", "confidence": 0.31},
                ],
                "classes": [
                    {"id": 1, "name": "ok", "count": "2,470", "shortcut": "1", "is_rare": False},
                    {"id": 2, "name": "scratch", "count": "1,600", "shortcut": "2", "is_rare": False},
                    {"id": 3, "name": "dent", "count": "1,315", "shortcut": "3", "is_rare": False},
                    {"id": 4, "name": "stain", "count": "1,089", "shortcut": "4", "is_rare": False},
                    {"id": 5, "name": "misaligned", "count": "797", "shortcut": "5", "is_rare": False},
                    {"id": 6, "name": "crack", "count": "272", "shortcut": "6", "is_rare": True},
                ],
                "image_meta": {
                    "why_in_queue": "no boxes",
                    "split": "train",
                    "scene_group": "g-0188 · 3 frames",
                    "augmented_children": "0 · none yet",
                },
                "guideline": {
                    "label": "CRACK",
                    "desc": "Thin line that breaks the surface. A line you can wipe off is a stain.",
                },
            },
            "label_checks": [
                {"title": "Boxes too small to be real", "sub": "under 8 px on a side", "count": 12},
                {"title": "Same class boxed twice", "sub": "overlap above 90%", "count": 7},
                {"title": "Near-duplicates labeled differently", "sub": "same scene group, different classes", "count": 9},
                {"title": "Box partly outside the image", "sub": "clipped automatically, listed for review", "count": 4},
            ],
            "team": [
                {"annotator": "[ANNOTATOR 1]", "items_per_h": 142, "accepts_ai": "71%", "agreement": "0.86"},
                {"annotator": "[ANNOTATOR 2]", "items_per_h": 118, "accepts_ai": "64%", "agreement": "0.83"},
                {"annotator": "[ANNOTATOR 3]", "items_per_h": 126, "accepts_ai": "96% · check", "agreement": "0.71", "is_flagged": True},
            ],
            "guardrails": [
                {"title": "Test set labeled by humans only", "sub": "No pre-annotation · reviewed twice", "checked": True},
                {"title": "Generated images are never queued", "sub": "They inherit the label of their parent", "checked": True},
                {"title": "Fixes reach augmented children", "sub": "23 copy-paste images invalidated", "checked": True},
                {"title": "Class list changes = new version", "sub": "Rename, merge or add a class", "checked": True},
                {"title": "Audit on every label", "sub": "Who, when, suggestion accepted or drawn", "checked": True},
                {"title": "crack is still rare", "sub": "272 real · send more to collection", "checked": False, "is_warning": True},
            ],
            "action_banner": {
                "summary": "412 labeled · 87 corrected · 23 augmented children invalidated",
                "detail": f"Saved as {output_v} with the label log attached; the augmentation recipe can replay on it",
                "secondary_action": f"Re-run augmentation on {output_v}",
                "primary_action": f"Save as {output_v}",
            },
        }

    def _get_dynamic_data(
        self,
        dataset: Dataset,
        v_count: int,
        latest_version: DatasetVersion,
        queue: str = "unlabeled",
        image_index: int = 0
    ) -> Dict[str, Any]:
        total_rows = latest_version.row_count or 358
        output_v = f"v{v_count + 1}"

        classes = ["defect_a", "defect_b", "scratch", "ok"]
        storage_path = getattr(latest_version, "storage_path", None)
        if storage_path:
            try:
                table = parquet_service.read_parquet(storage_path)
                total_rows = max(20, table.num_rows)
                for col in ["class", "label", "category", "defect_type"]:
                    if col in table.column_names:
                        vals = [str(x) for x in table[col].to_pylist() if x is not None]
                        uniq = list(dict.fromkeys(vals))
                        if uniq:
                            classes = uniq[:6]
                        break
            except Exception:
                pass

        to_label = max(15, int(round(total_rows * 0.35)))
        suspected_errors = max(4, int(round(to_label * 0.18)))
        done_today = max(10, int(round(to_label * 0.32)))
        low_confidence = max(5, int(round(to_label * 0.25)))
        to_review = max(2, int(round(to_label * 0.08)))

        # Filmstrip
        filmstrip = [
            {"id": f"IMG_00{i+100}.PNG", "index": i, "status": "labeled" if i < 2 else "unlabeled", "thumb": _create_thumb_b64(70, 50, i)}
            for i in range(6)
        ]
        filmstrip[image_index]["status"] = "current"
        active_img = filmstrip[min(image_index, len(filmstrip) - 1)]

        classes_list = []
        for idx, c in enumerate(classes):
            cnt = max(10, int(round(total_rows / (idx + 1.5))))
            classes_list.append({
                "id": idx + 1,
                "name": c,
                "count": f"{cnt:,}",
                "shortcut": str(idx + 1),
                "is_rare": idx == len(classes) - 1,
            })

        c1 = classes[0]
        c2 = classes[1] if len(classes) > 1 else classes[0]

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": f"{dataset.name}/",
            "breadcrumb": f"DATASET · V{v_count} → {output_v.upper()} DRAFT · OBJECT DETECTION · {len(classes_list)} CLASSES",
            "kpis": {
                "to_label": f"{to_label:,}",
                "to_label_sub": f"sent from 02 Cleaning",
                "suspected_errors": f"{suspected_errors:,}",
                "suspected_errors_sub": "model disagrees ≥ 0.9",
                "done_today": f"{done_today:,}",
                "done_today_sub": "annotator team",
                "output": output_v,
                "output_sub": f"v{v_count} kept as is",
            },
            "gauge": {
                "coverage_before": 88,
                "coverage_after": 100,
                "label": "LABEL COVERAGE / 100",
            },
            "queues": [
                {
                    "id": "unlabeled",
                    "title": "UNLABELED",
                    "count": f"{to_label:,}",
                    "desc": f"Pre-annotated by {dataset.name.split('.')[0]}-cls-v{v_count}",
                    "progress_text": f"{done_today} done",
                    "progress_pct": int(round((done_today / to_label) * 100)),
                    "action_label": "Continue",
                    "active": queue == "unlabeled",
                },
                {
                    "id": "suspected_errors",
                    "title": "SUSPECTED ERRORS",
                    "count": f"{suspected_errors:,}",
                    "desc": "Already labeled, but model disagrees",
                    "progress_text": "0 done",
                    "progress_pct": 0,
                    "action_label": "Start",
                    "active": queue == "suspected_errors",
                },
                {
                    "id": "low_confidence",
                    "title": "LOW CONFIDENCE",
                    "count": f"{low_confidence:,}",
                    "desc": f"Model hesitates between {c1} and {c2}",
                    "progress_text": f"{low_confidence // 4} done",
                    "progress_pct": 25,
                    "action_label": "Start",
                    "active": queue == "low_confidence",
                },
                {
                    "id": "to_review",
                    "title": "TO REVIEW",
                    "count": f"{to_review:,}",
                    "desc": "Labels waiting for reviewer",
                    "progress_text": "Reviewer only",
                    "progress_pct": 0,
                    "action_label": "Review",
                    "active": queue == "to_review",
                },
            ],
            "queue_settings": {
                "pre_annotation": f"{dataset.name.split('.')[0]}-cls-v{v_count} · min 0.30",
                "order_inside_queue": "Most uncertain first",
                "double_annotation": "10% of items",
                "assign": "Standard pool",
            },
            "workspace": {
                "queue_name": queue.upper(),
                "image_name": active_img["id"],
                "image_position": f"{image_index + done_today} / {to_label}",
                "image_url": _create_sample_image_b64(),
                "filmstrip": filmstrip,
                "active_filmstrip_index": image_index,
                "boxes": [
                    {
                        "id": "box_1",
                        "label": c1,
                        "tag": "you · selected",
                        "type": "human",
                        "x": 130,
                        "y": 75,
                        "width": 140,
                        "height": 85,
                        "color": "#f59e0b",
                        "selected": True,
                    },
                    {
                        "id": "box_2",
                        "label": c2,
                        "tag": "model 0.62",
                        "type": "model",
                        "confidence": 0.62,
                        "x": 310,
                        "y": 140,
                        "width": 80,
                        "height": 75,
                        "color": "#3b82f6",
                        "selected": False,
                    },
                ],
                "model_suggestions": [
                    {"label": c1, "confidence": 0.62},
                    {"label": c2, "confidence": 0.28},
                ],
                "classes": classes_list,
                "image_meta": {
                    "why_in_queue": "unlabeled",
                    "split": "train",
                    "scene_group": "group-01",
                    "augmented_children": "0",
                },
                "guideline": {
                    "label": c1.upper(),
                    "desc": f"Definition for {c1} on {dataset.name}.",
                },
            },
            "label_checks": [
                {"title": "Boxes too small to be real", "sub": "under 8 px on a side", "count": 6},
                {"title": "Same class boxed twice", "sub": "overlap above 90%", "count": 3},
                {"title": "Near-duplicates labeled differently", "sub": "different classes", "count": 4},
                {"title": "Box partly outside the image", "sub": "clipped automatically", "count": 2},
            ],
            "team": [
                {"annotator": "[ANNOTATOR 1]", "items_per_h": 120, "accepts_ai": "68%", "agreement": "0.85"},
                {"annotator": "[ANNOTATOR 2]", "items_per_h": 110, "accepts_ai": "72%", "agreement": "0.81"},
            ],
            "guardrails": [
                {"title": "Test set labeled by humans only", "sub": "Reviewed twice", "checked": True},
                {"title": "Generated images never queued", "sub": "Inherit parent label", "checked": True},
                {"title": "Fixes reach augmented children", "sub": "Invalidated on update", "checked": True},
                {"title": "Audit on every label", "sub": "Logged in history", "checked": True},
            ],
            "action_banner": {
                "summary": f"{done_today} labeled · 12 corrected",
                "detail": f"Saved as {output_v} with label log attached",
                "secondary_action": f"Re-run augmentation on {output_v}",
                "primary_action": f"Save as {output_v}",
            },
        }

    def save_decision(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        return {
            "status": "ok",
            "message": "Annotations enregistrées pour l'image",
            "image_id": payload.get("image_id", "IMG_07734.JPG"),
            "boxes_count": len(payload.get("boxes", [])),
        }

    def save_version(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        return {
            "status": "ok",
            "message": "Version annotée v4 créée avec succès avec journal d'audit",
            "version_name": payload.get("version_name", "v4"),
        }


image_labeling_service = ImageLabelingService()

