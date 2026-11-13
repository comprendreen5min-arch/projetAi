import io
import base64
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException
from PIL import Image, ImageDraw

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.services.parquet_service import parquet_service


def _create_error_item_thumb(label_box: bool = True, pred_box: bool = True, box_color: str = "#ef4444") -> str:
    im = Image.new("RGB", (180, 110), (32, 35, 40))
    d = ImageDraw.Draw(im)
    # Inner metallic part
    d.rounded_rectangle([20, 15, 160, 95], radius=5, fill=(55, 60, 68), outline=(75, 82, 92), width=1)
    # Feature line / crack or dent
    d.line([(60, 55), (120, 45)], fill=(22, 24, 28), width=2)

    col = (239, 68, 68) if box_color == "#ef4444" else (59, 130, 246) if box_color == "#3b82f6" else (245, 158, 11)
    if label_box:
        d.rectangle([50, 35, 130, 70], outline=col, width=2)
    if pred_box and not label_box:
        # Dashed prediction
        d.rectangle([65, 30, 115, 75], outline=(59, 130, 246), width=1)

    buf = io.BytesIO()
    im.save(buf, format="JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


class ImageTrainingService:
    """Service dedicated to Image Training (06 Training for images).
    Provides YOLO/object detection experiment management, live runs, evaluation,
    confusion matrix, slices, error diagnosis, and edge benchmarking.
    """

    def get_training_data(
        self,
        dataset_id: str,
        db: Session,
        run_filter: str = "all",
        selected_run_id: Optional[str] = None
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
            return self._get_template_data(dataset, len(versions), run_filter, selected_run_id)
        else:
            return self._get_dynamic_data(dataset, len(versions), versions[0], run_filter, selected_run_id)

    def _get_template_data(
        self,
        dataset: Dataset,
        v_count: int,
        run_filter: str = "all",
        selected_run_id: Optional[str] = None
    ) -> Dict[str, Any]:
        runs = [
            {
                "id": "yolo-defects-v4-m",
                "data": "v4",
                "model": "YOLO11-m",
                "status": "running · epoch 64 / 120",
                "map50_val": "0.884",
                "time": "1 h 48",
                "tag": "LIVE",
                "is_running": True,
                "progress_pct": 53,
            },
            {
                "id": "yolo-defects-v4",
                "data": "v4",
                "model": "YOLO11-s",
                "status": "done · 120 epochs",
                "map50_val": "0.892",
                "time": "2 h 55",
                "tag": "CANDIDATE",
                "is_running": False,
            },
            {
                "id": "yolo-defects-v4-1600",
                "data": "v4",
                "model": "YOLO11-s · 1600 px",
                "status": "stopped at epoch 71 · no gain in 20",
                "map50_val": "0.879",
                "time": "2 h 10",
                "tag": "",
                "is_running": False,
            },
            {
                "id": "yolo-defects-v3",
                "data": "v3",
                "model": "YOLO11-s",
                "status": "done",
                "map50_val": "0.864",
                "time": "2 h 41",
                "tag": "PRODUCTION",
                "is_running": False,
            },
            {
                "id": "yolo-defects-v2",
                "data": "v2",
                "model": "YOLO11-s",
                "status": "done",
                "map50_val": "0.812",
                "time": "2 h 30",
                "tag": "ARCHIVED",
                "is_running": False,
            },
        ]

        filtered_runs = runs
        if run_filter == "running":
            filtered_runs = [r for r in runs if r.get("is_running")]
        elif run_filter == "done":
            filtered_runs = [r for r in runs if not r.get("is_running")]

        sel_run = selected_run_id or "yolo-defects-v4"

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": "product_defects/",
            "breadcrumb": "EXPERIMENT · 5 RUNS · DATA DEFECTS@V4 · OBJECT DETECTION · 6 CLASSES · TEST SET LOCKED",
            "candidate_version": "v4",
            "kpis": {
                "runs": "5",
                "runs_sub": "1 running · 1 stopped early",
                "data": "defects@v4",
                "data_sub": "412 labeled · 87 corrected",
                "compute": "21 GPU h",
                "compute_sub": "this week · budget 60 h",
                "in_production": "yolo-defects-v3",
                "in_production_sub": "on line mini PCs",
            },
            "new_run_config": {
                "dataset_version": "defects@v4 · current",
                "train_view": "Real + copy-paste · train split only",
                "splits_info": "Splits from 04: 70 / 15 / 15 · by scene group · train 8,882 · val 1,560 · test 1,776",
                "image_size_info": "Image size 1280 px · letterbox, as in 04",
                "on_the_fly_augmentation": [
                    {"id": "hflip", "name": "Horizontal flip", "checked": True},
                    {"id": "scale", "name": "Scale 0.5 - 1.5", "checked": True},
                    {"id": "bright", "name": "Brightness ± 25%", "checked": True},
                    {"id": "mosaic", "name": "Mosaic · off last 10 ep.", "checked": True},
                    {"id": "vflip", "name": "Vertical flip", "checked": False},
                    {"id": "mixup", "name": "Mixup", "checked": False},
                ],
                "model_architecture": "YOLO11-s · COCO pretrained",
                "epochs": 120,
                "patience": 20,
                "batch": 16,
                "lr0": "0.01",
                "optimize": "mAP@50 · all classes",
                "runs_on": "Line mini PC · CPU · OpenVINO",
                "latency_budget": "≤ 120 ms per frame",
                "compute": {
                    "worker": "1 x [GPU TYPE]",
                    "precision": "Mixed · fp16",
                    "seed": "42 · deterministic",
                    "estimate": "≈ 3 h 10 · 3.2 GPU h",
                },
                "checks_before_start": [
                    {"title": "Test set hash unchanged", "sub": "1,776 images · labeled by humans only", "ok": True},
                    {"title": "Copy-paste images in train only", "sub": "927 generated · none in val or test", "ok": True},
                    {"title": "Scene groups never split", "sub": "Frames of one scene stay in one split", "ok": True},
                    {"title": "Boxes match their images", "sub": "Checked after letterbox to 1280 px", "ok": True},
                    {"title": "crack is rare", "sub": "272 real boxes · its score will be noisy", "ok": False, "is_warning": True},
                ],
                "command": "datalift train defects@v4 --config yolo11s.yaml",
            },
            "runs_section": {
                "counts": {"all": 5, "running": 1, "done": 4},
                "runs": filtered_runs,
                "active_run": {
                    "id": "yolo-defects-v4-m",
                    "status_tag": "RUNNING",
                    "header_sub": "Epoch 64 / 120 · GPU 97% · ETA 1 h 30",
                    "val_preview": [
                        {"epoch": 60, "box": "rect", "color": "#f59e0b"},
                        {"epoch": 60, "box": "rect", "color": "#f59e0b"},
                        {"epoch": 60, "box": "dashed", "color": "#3b82f6"},
                        {"epoch": 60, "box": "none", "color": "transparent"},
                    ],
                },
            },
            "evaluate": {
                "selected_run": sel_run,
                "selected_split": "val · 1,560 images",
                "summary_kpis": {
                    "map50": "0.892",
                    "map50_sub": "all 6 classes",
                    "map50_95": "0.648",
                    "map50_95_sub": "tighter boxes count",
                    "recall_crack": "0.84",
                    "recall_crack_sub": "a missed crack is costly",
                    "latency_device": "78 ms",
                    "latency_device_sub": "measured on the device",
                    "test_set": "locked",
                    "test_set_sub": "opened 0 times for this run",
                },
                "per_class": [
                    {"name": "ok", "boxes": 520, "precision": "0.94", "recall": "0.96", "ap50": "0.96"},
                    {"name": "scratch", "boxes": 340, "precision": "0.89", "recall": "0.87", "ap50": "0.90"},
                    {"name": "dent", "boxes": 280, "precision": "0.88", "recall": "0.86", "ap50": "0.89"},
                    {"name": "stain", "boxes": 230, "precision": "0.85", "recall": "0.84", "ap50": "0.86"},
                    {"name": "misaligned", "boxes": 170, "precision": "0.83", "recall": "0.81", "ap50": "0.84"},
                    {"name": "crack", "boxes": 58, "precision": "0.81", "recall": "0.84", "ap50": "0.84", "is_rare": True},
                ],
                "confusion_matrix": {
                    "labels": ["OK", "SCR", "DENT", "STN", "MIS", "CRK", "BG"],
                    "matrix": [
                        [94, 1, 1, 1, 0, 0, 3],
                        [1, 87, 3, 2, 0, 1, 6],
                        [2, 2, 86, 1, 1, 0, 8],
                        [1, 4, 2, 84, 0, 0, 9],
                        [0, 1, 1, 1, 81, 1, 15],
                        [0, 2, 0, 1, 0, 84, 13],
                        [3, 4, 3, 5, 2, 3, 80],
                    ],
                },
                "deployment_thresholds": {
                    "confidence_all": 0.35,
                    "confidence_crack": 0.25,
                    "nms_iou": 0.60,
                    "false_alarms_per_1k": "12",
                    "missed_cracks_per_1k": "2",
                },
                "slices": [
                    {"slice": "camera = line 1", "images": 820, "map50": "0.91", "flag": "ok"},
                    {"slice": "camera = line 2", "images": 740, "map50": "0.88", "flag": "ok"},
                    {"slice": "too dark · listed in 02", "images": 52, "map50": "0.68", "flag": "WEAK", "is_weak": True},
                    {"slice": "small boxes < 32 px", "images": 210, "map50": "0.82", "flag": "ok"},
                    {"slice": "night shift", "images": 190, "map50": "0.86", "flag": "ok"},
                ],
                "errors_to_look_at": [
                    {
                        "image_id": "IMG_09114",
                        "tag": "MISSED",
                        "tag_type": "red",
                        "desc": "crack · no box predicted",
                        "action_label": "Add to 07 pool",
                        "action_target": "07",
                        "thumb": _create_error_item_thumb(label_box=True, pred_box=False, box_color="#ef4444"),
                    },
                    {
                        "image_id": "IMG_08870",
                        "tag": "FALSE ALARM",
                        "tag_type": "blue",
                        "desc": "stain 0.51 · light reflection",
                        "action_label": "Add to 07 pool",
                        "action_target": "07",
                        "thumb": _create_error_item_thumb(label_box=False, pred_box=True, box_color="#3b82f6"),
                    },
                    {
                        "image_id": "IMG_10233",
                        "tag": "WRONG CLASS",
                        "tag_type": "orange",
                        "desc": "crack → scratch 0.44",
                        "action_label": "Label is wrong → 05",
                        "action_target": "05",
                        "thumb": _create_error_item_thumb(label_box=True, pred_box=True, box_color="#f59e0b"),
                    },
                    {
                        "image_id": "IMG_07702",
                        "tag": "LOOSE BOX",
                        "tag_type": "gray",
                        "desc": "dent · IoU 0.41 with label",
                        "action_label": "Label is wrong → 05",
                        "action_target": "05",
                        "thumb": _create_error_item_thumb(label_box=True, pred_box=False, box_color="#6b7280"),
                    },
                ],
            },
            "compare_and_promote": {
                "comparison_table": [
                    {"metric": "Test set hash", "prod": "same", "cand": "same", "change": "✓ comparable", "is_ok": True},
                    {"metric": "mAP@50", "prod": "0.864", "cand": "0.892", "change": "+2.8%", "is_ok": True},
                    {"metric": "Recall · crack", "prod": "0.789", "cand": "0.840", "change": "+5.1%", "is_ok": True},
                    {"metric": "False alarms / 1k parts", "prod": "18", "cand": "12", "change": "-6 (-33%)", "is_ok": True},
                ],
                "before_production": [
                    {"label": "Same locked test set", "done": True},
                    {"label": "Beats production on mAP@50", "done": True},
                    {"label": "Crack recall not lower than production", "done": True},
                    {"label": "Within latency budget on the device", "done": True},
                    {"label": "3 days in shadow mode on line 2", "done": False},
                    {"label": "Approved by a second person", "done": False},
                ],
                "edge_benchmark": [
                    {"export": "OpenVINO · FP16", "latency": "78 ms", "map50_kept": "99.8%", "size": "22 MB"},
                    {"export": "OpenVINO · INT8", "latency": "42 ms", "map50_kept": "98.2%", "size": "6 MB"},
                    {"export": "ONNX · FP32", "latency": "112 ms", "map50_kept": "100%", "size": "44 MB"},
                ],
                "replay_command": "datalift train --replay yolo-defects-v4",
            },
            "guardrails": [
                {"title": "Test set opened only to promote", "sub": "Every opening is counted on the run", "checked": True},
                {"title": "Copy-paste images in train only", "sub": "Generated images never reach val or test", "checked": True},
                {"title": "Scene groups never split", "sub": "Same in every run", "checked": True},
                {"title": "Crack recall can't regress", "sub": "Promotion is blocked otherwise", "checked": True},
                {"title": "Speed measured on the device", "sub": "Not on the training GPU", "checked": True},
                {"title": "Shadow before switch", "sub": "One device first, then the fleet", "checked": True},
                {"title": "Every run can be replayed", "sub": "data + config + code + seed + environment", "checked": True},
                {"title": "crack is still rare", "sub": "58 boxes in val · collect more in 07", "checked": False, "is_warning": True},
            ],
            "action_banner": {
                "summary": "yolo-defects-v4 · YOLO11-s · trained on v4 · candidate",
                "detail": "Model card generated: classes, thresholds, metrics on locked test, edge latency, known limits",
                "secondary_action": "Start shadow mode",
                "primary_action": "Continue to active learning →",
            },
        }

    def _get_dynamic_data(
        self,
        dataset: Dataset,
        v_count: int,
        latest_version: DatasetVersion,
        run_filter: str = "all",
        selected_run_id: Optional[str] = None
    ) -> Dict[str, Any]:
        total_rows = latest_version.row_count or 358
        output_v = f"v{v_count}"
        base_name = dataset.name.split('.')[0]

        train_rows = max(20, int(round(total_rows * 0.70)))
        val_rows = max(5, int(round(total_rows * 0.15)))
        test_rows = max(5, total_rows - train_rows - val_rows)

        runs = [
            {
                "id": f"{base_name}-yolo-v{v_count}",
                "data": f"v{v_count}",
                "model": "YOLO11-s",
                "status": "done · 100 epochs",
                "map50_val": "0.875",
                "time": "1 h 15",
                "tag": "CANDIDATE",
                "is_running": False,
            },
            {
                "id": f"{base_name}-baseline",
                "data": "v1",
                "model": "YOLO11-n",
                "status": "done",
                "map50_val": "0.820",
                "time": "45 min",
                "tag": "PRODUCTION",
                "is_running": False,
            },
        ]

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": f"{dataset.name}/",
            "breadcrumb": f"EXPERIMENT · {len(runs)} RUNS · DATA {base_name.upper()}@{output_v} · OBJECT DETECTION · TEST SET LOCKED",
            "candidate_version": output_v,
            "kpis": {
                "runs": f"{len(runs)}",
                "runs_sub": "all completed",
                "data": f"{base_name}@{output_v}",
                "data_sub": f"{total_rows} images processed",
                "compute": "6 GPU h",
                "compute_sub": "this week",
                "in_production": f"{base_name}-baseline",
                "in_production_sub": "on production edge",
            },
            "new_run_config": {
                "dataset_version": f"{base_name}@{output_v} · current",
                "train_view": "Real + augment · train split only",
                "splits_info": f"Splits: 70 / 15 / 15 · train {train_rows} · val {val_rows} · test {test_rows}",
                "image_size_info": "Image size 1280 px · letterbox",
                "on_the_fly_augmentation": [
                    {"id": "hflip", "name": "Horizontal flip", "checked": True},
                    {"id": "scale", "name": "Scale 0.5 - 1.5", "checked": True},
                    {"id": "bright", "name": "Brightness ± 25%", "checked": True},
                    {"id": "mosaic", "name": "Mosaic · off last 10 ep.", "checked": False},
                ],
                "model_architecture": "YOLO11-s · COCO pretrained",
                "epochs": 100,
                "patience": 15,
                "batch": 16,
                "lr0": "0.01",
                "optimize": "mAP@50 · all classes",
                "runs_on": "Mini PC · OpenVINO",
                "latency_budget": "≤ 100 ms per frame",
                "compute": {
                    "worker": "1 x GPU",
                    "precision": "Mixed · fp16",
                    "seed": "42",
                    "estimate": "≈ 1 h 15 · 1.5 GPU h",
                },
                "checks_before_start": [
                    {"title": "Test set hash unchanged", "sub": f"{test_rows} images locked", "ok": True},
                    {"title": "Boxes match images", "sub": "Verified", "ok": True},
                ],
                "command": f"datalift train {base_name}@{output_v} --config yolo11s.yaml",
            },
            "runs_section": {
                "counts": {"all": len(runs), "running": 0, "done": len(runs)},
                "runs": runs,
                "active_run": {
                    "id": f"{base_name}-yolo-v{v_count}",
                    "status_tag": "DONE",
                    "header_sub": "100 / 100 epochs completed",
                    "val_preview": [
                        {"epoch": 100, "box": "rect", "color": "#f59e0b"},
                        {"epoch": 100, "box": "rect", "color": "#f59e0b"},
                    ],
                },
            },
            "evaluate": {
                "selected_run": f"{base_name}-yolo-v{v_count}",
                "selected_split": f"val · {val_rows} images",
                "summary_kpis": {
                    "map50": "0.875",
                    "map50_sub": "all classes",
                    "map50_95": "0.620",
                    "map50_95_sub": "tighter boxes count",
                    "recall_crack": "0.82",
                    "recall_crack_sub": "primary defect class",
                    "latency_device": "65 ms",
                    "latency_device_sub": "device test",
                    "test_set": "locked",
                    "test_set_sub": "opened 0 times",
                },
                "per_class": [
                    {"name": "defect_a", "boxes": max(10, val_rows // 2), "precision": "0.90", "recall": "0.88", "ap50": "0.89"},
                    {"name": "defect_b", "boxes": max(5, val_rows // 4), "precision": "0.84", "recall": "0.82", "ap50": "0.83"},
                ],
                "confusion_matrix": {
                    "labels": ["DEF_A", "DEF_B", "BG"],
                    "matrix": [
                        [88, 4, 8],
                        [3, 85, 12],
                        [5, 7, 88],
                    ],
                },
                "deployment_thresholds": {
                    "confidence_all": 0.35,
                    "confidence_crack": 0.25,
                    "nms_iou": 0.60,
                    "false_alarms_per_1k": "15",
                    "missed_cracks_per_1k": "3",
                },
                "slices": [
                    {"slice": "camera = line 1", "images": val_rows, "map50": "0.88", "flag": "ok"},
                ],
                "errors_to_look_at": [
                    {
                        "image_id": "IMG_00101",
                        "tag": "MISSED",
                        "tag_type": "red",
                        "desc": "defect_a · no box predicted",
                        "action_label": "Add to 07 pool",
                        "action_target": "07",
                        "thumb": _create_error_item_thumb(label_box=True, pred_box=False, box_color="#ef4444"),
                    },
                ],
            },
            "compare_and_promote": {
                "comparison_table": [
                    {"metric": "Test set hash", "prod": "same", "cand": "same", "change": "✓ comparable", "is_ok": True},
                    {"metric": "mAP@50", "prod": "0.820", "cand": "0.875", "change": "+5.5%", "is_ok": True},
                ],
                "before_production": [
                    {"label": "Same locked test set", "done": True},
                    {"label": "Beats production on mAP@50", "done": True},
                ],
                "edge_benchmark": [
                    {"export": "OpenVINO · FP16", "latency": "65 ms", "map50_kept": "99.5%", "size": "22 MB"},
                ],
                "replay_command": f"datalift train --replay {base_name}-yolo-v{v_count}",
            },
            "guardrails": [
                {"title": "Test set opened only to promote", "sub": "Every opening is counted on the run", "checked": True},
                {"title": "Copy-paste images in train only", "sub": "Generated images never reach val or test", "checked": True},
                {"title": "Scene groups never split", "sub": "Same in every run", "checked": True},
                {"title": "Target recall can't regress", "sub": "Promotion is blocked otherwise", "checked": True},
                {"title": "Speed measured on the device", "sub": "Not on the training GPU", "checked": True},
                {"title": "Shadow before switch", "sub": "One device first, then the fleet", "checked": True},
                {"title": "Every run can be replayed", "sub": "data + config + code + seed + environment", "checked": True},
                {"title": "Rare classes monitored", "sub": f"{val_rows} boxes in val · collect more in 07", "checked": False, "is_warning": True},
            ],
            "action_banner": {
                "summary": f"{base_name}-yolo-v{v_count} · YOLO11-s · candidate",
                "detail": "Model card generated: classes, thresholds, edge latency",
                "secondary_action": "Start shadow mode",
                "primary_action": "Continue to active learning →",
            },
        }

    def start_run(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        return {
            "status": "ok",
            "message": "Entraînement YOLO lancé sur le cluster GPU",
            "run_id": f"yolo-run-{int(db.query(Dataset).filter(Dataset.id == dataset_id).count()) + 101}",
        }

    def start_shadow_mode(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        return {
            "status": "ok",
            "message": "Shadow mode activé sur les mini PC de la ligne",
            "device": payload.get("device", "Line 2 mini PC"),
        }


image_training_service = ImageTrainingService()
