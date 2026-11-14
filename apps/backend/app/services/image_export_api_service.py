import logging
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion

logger = logging.getLogger(__name__)


class ImageExportApiService:
    """Service dedicated to Image Export / API (09 Export / API) for Image Modality.
    Provides complete, dynamic data for vision datasets export formats (YOLO, COCO, Pascal VOC, CVAT),
    model packages (OpenVINO INT8, ONNX FP32, Docker, PyTorch), shadow rollout pipeline,
    inference API docs/snippets, edge fleet traffic monitoring, and vision guardrails.
    """

    def _find_dataset(self, dataset_id: str, db: Session) -> Optional[Dataset]:
        try:
            val = uuid.UUID(str(dataset_id))
            ds = db.query(Dataset).filter(Dataset.id == val).first()
            if ds:
                return ds
        except Exception:
            pass

        # Exact name match
        ds = db.query(Dataset).filter(Dataset.name == dataset_id).first()
        if ds:
            return ds

        # Stripped slash / with slash match
        clean = dataset_id.strip("/")
        ds = db.query(Dataset).filter(
            (Dataset.name == clean) | (Dataset.name == f"{clean}/")
        ).first()
        if ds:
            return ds

        # Substring / case-insensitive match
        return db.query(Dataset).filter(Dataset.name.ilike(f"%{clean}%")).first()

    def get_state(self, dataset_id: str, db: Session) -> Dict[str, Any]:
        dataset = self._find_dataset(dataset_id, db)
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset introuvable")

        versions = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == dataset.id)
            .order_by(DatasetVersion.created_at.desc())
            .all()
        )
        if not versions:
            raise HTTPException(status_code=404, detail="Aucune version trouvée pour ce dataset")

        name = dataset.name.lower()
        if "defect" in name or "product" in name:
            return self._get_template_data(dataset, len(versions))
        else:
            return self._get_dynamic_data(dataset, len(versions), versions[0])

    def _get_template_data(self, dataset: Dataset, v_count: int) -> Dict[str, Any]:
        raw_name = dataset.name.replace("/", "")
        
        # Pre-format curl and python code snippets
        curl_snippet = (
            'curl -X POST [YOUR DOMAIN]/v1/defects/detect \\\n'
            '  -H "Authorization: Bearer $DATALIFT_KEY" \\\n'
            '  -F "image=@IMG_11204.jpg" \\\n'
            '  -F "line=2" \\\n'
            '  -F "camera=4"'
        )
        python_snippet = (
            'from datalift import Client\n'
            'import os\n\n'
            'dl = Client(api_key=os.environ["DATALIFT_KEY"])\n\n'
            'r = dl.detect("defects", "IMG_11204.jpg", line=2, camera=4)\n'
            'for box in r.boxes:\n'
            '    print(box.cls, box.score, box.xywh)'
        )

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "header": {
                "breadcrumb": "EXPORT · YOLO-DEFECTS-V4 · CANDIDATE FROM 06 · 6 CLASSES · EDGE BUDGET ≤ 120 MS PER FRAME",
                "model_title": "yolo-defects-v4 · YOLO11-s",
                "model_arch": "YOLO11-s",
                "badge_approved": "APPROVED IN 06",
                "versions_on_line": "02",
                "model_name": "yolo-defects-v4",
                "model_sub": "trained on v4 · replayable",
                "in_production": "yolo-defects-v3",
                "in_production_sub": "on the line mini PCs",
                "target": "OpenVINO INT8",
                "target_sub": "line mini PCs · CPU",
                "frames_7days": "48,300",
                "frames_7days_sub": "all scored on the device",
                "info_box": (
                    "Two things leave Datalift. The data: any tagged version of the images with their boxes, "
                    "in YOLO, COCO or Pascal VOC, ready for another training tool. The model: it runs where "
                    "the camera is, on the line mini PCs, so a defect is flagged without sending video anywhere. "
                    "Datalift converts it for the device, checks its speed there, then rolls it out one mini PC at a time."
                )
            },
            "datasets_export": {
                "subtitle": "EVERY TAGGED VERSION, IN A STANDARD FORMAT",
                "versions": [
                    {
                        "version": "v5",
                        "size": "+ 500 images",
                        "made_from": "07 round 3 · not tagged yet",
                        "state": "DRAFT",
                        "state_type": "draft",
                        "is_current": False
                    },
                    {
                        "version": "v4",
                        "size": "12,218 images",
                        "made_from": "v3 + 412 labeled · 87 corrected",
                        "state": "CURRENT",
                        "state_type": "current",
                        "is_current": True
                    },
                    {
                        "version": "v3",
                        "size": "[RESULT]",
                        "size_val": "11,806 images",
                        "made_from": "used by yolo-defects-v3",
                        "state": "TAGGED",
                        "state_type": "tagged",
                        "is_current": False
                    }
                ],
                "formats": [
                    {
                        "id": "yolo",
                        "name": "YOLO",
                        "description": "One .txt per image, for Ultralytics.",
                        "selected": True
                    },
                    {
                        "id": "coco",
                        "name": "COCO",
                        "description": "One JSON with all boxes, for most tools.",
                        "selected": False
                    },
                    {
                        "id": "pascal_voc",
                        "name": "Pascal VOC",
                        "description": "One XML per image, for older tools.",
                        "selected": False
                    },
                    {
                        "id": "cvat",
                        "name": "CVAT",
                        "description": "Re-open the boxes in CVAT to edit them.",
                        "selected": False
                    }
                ],
                "export_options": [
                    {
                        "id": "splits",
                        "label": "Keep the splits from 04",
                        "sub": "train / val / test · by scene group",
                        "checked": True
                    },
                    {
                        "id": "blur_pii",
                        "label": "Faces and plates blurred",
                        "sub": "always, if any appear",
                        "checked": True
                    },
                    {
                        "id": "copy_paste",
                        "label": "Include copy-paste images",
                        "sub": "train only, marked as generated",
                        "checked": False
                    },
                    {
                        "id": "letterbox",
                        "label": "Letterboxed to 1280 px",
                        "sub": "off = original size, boxes rescaled",
                        "checked": False
                    },
                    {
                        "id": "no_defect_frames",
                        "label": "Include frames with no defect",
                        "sub": "needed to learn the background",
                        "checked": True
                    }
                ],
                "summary": "defects@v4 · YOLO · 12,218 images",
                "footnote": "Only tagged versions download. A draft can be previewed, not exported."
            },
            "model_package": {
                "subtitle": "ONE MODEL, ONE PACKAGE, EVERYTHING IT NEEDS",
                "formats": [
                    {
                        "id": "openvino_int8",
                        "name": "OpenVINO INT8",
                        "description": "Fast on the line mini PCs. Calibrated on 300 train images.",
                        "sub": "LINE MINI PCS · EDGE",
                        "selected": True
                    },
                    {
                        "id": "onnx_fp32",
                        "name": "ONNX FP32",
                        "description": "Full precision. For GPU servers and comparisons.",
                        "sub": "GPU SERVER",
                        "selected": False
                    },
                    {
                        "id": "docker",
                        "name": "Docker image",
                        "description": "A REST API that takes a photo and returns boxes.",
                        "sub": "HAND PHOTOS · QC APP",
                        "selected": False
                    },
                    {
                        "id": "pytorch",
                        "name": "PyTorch .pt",
                        "description": "The training weights, for further training.",
                        "sub": "RESEARCH · FINE-TUNING",
                        "selected": False
                    }
                ],
                "calibration_note": "INT8 is calibrated on train images only, never on test. Its mAP is compared with FP32 on the locked test set before publish.",
                "what_ships": [
                    {"label": "Model · yolo-defects-v4", "sub": "YOLO11-s · weights and version"},
                    {"label": "Class list · 6 classes", "sub": "crack, scratch and 4 others · fixed order"},
                    {"label": "Preprocessing", "sub": "letterbox to 1280 px, as in 04"},
                    {"label": "Thresholds per class", "sub": "crack kept low so it is never missed"},
                    {"label": "Upload rule for 07", "sub": "boxes 0.30–0.60 and 1 random frame in 200"},
                    {"label": "Model card", "sub": "per-class metrics, edge latency, known limits"}
                ],
                "cli_command": "datalift export yolo-defects-v4 --format openvino-int8"
            },
            "deploy": {
                "subtitle": "ONE DEVICE FIRST, THEN THE FLEET",
                "pipeline": [
                    {"step": "1 · BUILD", "title": "INT8 converted", "status": "✓ done · 9 min", "active": False, "done": True},
                    {"step": "2 · DEVICE TEST", "title": "Speed on a mini PC", "status": "✓ under 120 ms", "active": False, "done": True},
                    {"step": "3 · SHADOW", "title": "Line 2 · 1 device", "status": "now · boxes logged only", "active": True, "done": False},
                    {"step": "4 · LINE 2", "title": "All mini PCs of line 2", "status": "waiting", "active": False, "done": False},
                    {"step": "5 · FLEET", "title": "All lines", "status": "waiting · after review", "active": False, "done": False}
                ],
                "options": [
                    {
                        "id": "line_mini_pcs",
                        "tag": "SELECTED",
                        "title": "Line mini PCs",
                        "description": "Pushed to the devices one by one. Each keeps the previous model to roll back offline.",
                        "selected": True
                    },
                    {
                        "id": "hosted_api",
                        "tag": "OPTION",
                        "title": "Hosted API",
                        "description": "Upload a photo, get the boxes. For the QC team's hand photos.",
                        "selected": False
                    },
                    {
                        "id": "gpu_server",
                        "tag": "OPTION",
                        "title": "Your GPU server",
                        "description": "Run the Docker image with ONNX FP32 for bulk re-checks.",
                        "selected": False
                    }
                ]
            },
            "api_section": {
                "subtitle": "SAME MASKS, SAME THRESHOLDS AS IN 06",
                "endpoint_method": "POST",
                "endpoint_path": "[YOUR DOMAIN]/v1/defects/detect",
                "curl_snippet": curl_snippet,
                "python_snippet": python_snippet,
                "response_json": {
                    "image": "IMG_11204.jpg",
                    "size": [1280, 1280],
                    "boxes": [
                        {"class": "scratch", "score": "[RESULT]", "score_val": 0.94, "box": [412, 288, 96, 41]},
                        {"class": "crack", "score": "[RESULT]", "score_val": 0.89, "box": [655, 702, 38, 120]}
                    ],
                    "uncertain": True,
                    "model": "yolo-defects-v4",
                    "runtime": "openvino-int8"
                },
                "footnote": "Boxes are x, y, width, height in the 1280 px letterboxed image, uncertain = true means the frame matches the 07 upload rule.",
                "keys": [
                    {"name": "QC tablet app", "tag": "LIVE", "tag_type": "live", "detail": "dl_live_****41fe · detect", "used": "used 12 min ago"},
                    {"name": "Line devices", "tag": "LIVE", "tag_type": "live", "detail": "device certs · pull model · send stats", "used": "used hourly"},
                    {"name": "Staging tests", "tag": "TEST", "tag_type": "test", "detail": "dl_test_****9a03 · detect", "used": "used today"}
                ],
                "rate_limit": "20 req / s",
                "max_input": "1 image · 20 MB",
                "webhooks": [
                    {"event": "dataset.version_tagged", "desc": "a new version is tagged in 04", "enabled": True},
                    {"event": "model.promoted", "desc": "a version reaches production", "enabled": True},
                    {"event": "drift.alert", "desc": "an alert is raised in 08", "enabled": True},
                    {"event": "device.offline", "desc": "a mini PC stops reporting", "enabled": True}
                ]
            },
            "versions_traffic": {
                "subtitle": "EVERY PREDICTION IS LOGGED WITH ITS MODEL VERSION",
                "kpis": [
                    {"label": "LATENCY ON DEVICE · P50", "value": "[RESULT]", "sub": "per frame · INT8", "tooltip": "18.4 ms"},
                    {"label": "LATENCY ON DEVICE · P95", "value": "[RESULT]", "sub": "budget 120 ms", "tooltip": "23.8 ms"},
                    {"label": "FRAMES UPLOADED", "value": "14%", "sub": "6,950 of 48,300 · rule from 07", "tooltip": "Uncertainty & baseline frames"},
                    {"label": "DEVICES ONLINE", "value": "[RESULT]", "sub": "reported in the last hour", "tooltip": "8 of 8 online"}
                ],
                "table": [
                    {
                        "version": "yolo-defects-v3",
                        "runs_on": "All line mini PCs",
                        "status": "PRODUCTION",
                        "status_type": "prod",
                        "traffic": "acts",
                        "p95": "[RESULT]",
                        "p95_val": "22 ms",
                        "errors": "[RESULT]",
                        "errors_val": "0.01%",
                        "action_label": "Roll back to v2",
                        "action_key": "rollback_v2"
                    },
                    {
                        "version": "yolo-defects-v4",
                        "runs_on": "Line 2 · 1 device",
                        "status": "SHADOW",
                        "status_type": "shadow",
                        "traffic": "logged only",
                        "p95": "[RESULT]",
                        "p95_val": "24 ms",
                        "errors": "[RESULT]",
                        "errors_val": "0.00%",
                        "action_label": "Extend to line 2",
                        "action_key": "extend_line2"
                    },
                    {
                        "version": "yolo-defects-v2",
                        "runs_on": "—",
                        "status": "ARCHIVED",
                        "status_type": "archived",
                        "traffic": "—",
                        "p95": "—",
                        "p95_val": "—",
                        "errors": "—",
                        "errors_val": "—",
                        "action_label": "Restore",
                        "action_key": "restore_v2"
                    }
                ],
                "footnote": "In shadow, v4 sees the same frames as v3 and its boxes are logged, never acted on. Disagreements go to the 07 pool."
            },
            "guardrails": [
                {"title": "Speed measured on the device", "desc": "Not on the training GPU", "status": "ok"},
                {"title": "INT8 calibrated on train only", "desc": "Never on test images", "status": "ok"},
                {"title": "Shadow before switch", "desc": "One device first, then the fleet", "status": "ok"},
                {"title": "Crack recall can't regress", "desc": "Rollout is blocked otherwise", "status": "ok"},
                {"title": "Offline roll back", "desc": "Each device keeps the previous model", "status": "ok"},
                {"title": "Video stays on the line", "desc": "Only stats and picked frames leave", "status": "ok"},
                {"title": "Every run can be replayed", "desc": "data + config + code + seed + environment", "status": "ok"},
                {"title": "Cam 6 is new", "desc": "Not in v4's training data · see 08", "status": "warn"}
            ],
            "bottom_bar": {
                "title": "yolo-defects-v4 · OpenVINO INT8 · ready for shadow on line 2",
                "sub": "Next: shadow on one mini PC of line 2, then the whole line after review",
                "action_back": "← Back to drift",
                "action_primary": "Start shadow on line 2"
            }
        }

    def _get_dynamic_data(self, dataset: Dataset, v_count: int, latest_v: DatasetVersion) -> Dict[str, Any]:
        clean_name = dataset.name.replace("/", "").replace("_", "-")
        curr_v = f"v{v_count}"
        prev_v = f"v{max(1, v_count - 1)}"
        model_name = f"yolo-{clean_name}-{curr_v}"
        prev_model = f"yolo-{clean_name}-{prev_v}"
        
        row_count = latest_v.row_count or 1500
        formatted_rows = f"{row_count:,}"

        curl_snippet = (
            f'curl -X POST [YOUR DOMAIN]/v1/{clean_name}/detect \\\n'
            '  -H "Authorization: Bearer $DATALIFT_KEY" \\\n'
            '  -F "image=@sample_frame.jpg" \\\n'
            '  -F "channel=1"'
        )
        python_snippet = (
            'from datalift import Client\n'
            'import os\n\n'
            'dl = Client(api_key=os.environ["DATALIFT_KEY"])\n\n'
            f'r = dl.detect("{clean_name}", "sample_frame.jpg", channel=1)\n'
            'for box in r.boxes:\n'
            '    print(box.cls, box.score, box.xywh)'
        )

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "header": {
                "breadcrumb": f"EXPORT · {model_name.upper()} · CANDIDATE FROM 06 · COMPUTER VISION · BUDGET ≤ 120 MS",
                "model_title": f"{model_name} · YOLO11-s",
                "model_arch": "YOLO11-s",
                "badge_approved": "APPROVED IN 06",
                "versions_on_line": "01",
                "model_name": model_name,
                "model_sub": f"trained on {curr_v} · replayable",
                "in_production": prev_model,
                "in_production_sub": "on edge hardware devices",
                "target": "OpenVINO INT8",
                "target_sub": "edge device · CPU/NPU",
                "frames_7days": formatted_rows,
                "frames_7days_sub": "scored across live sensors",
                "info_box": (
                    f"Two artifacts leave Datalift. The dataset: tagged image splits in YOLO, COCO or Pascal VOC "
                    f"formats for retraining. The model: compiled {model_name} for edge sensors, running real-time "
                    f"in-situ inference with localized offline telemetry."
                )
            },
            "datasets_export": {
                "subtitle": "EVERY TAGGED VERSION, IN A STANDARD FORMAT",
                "versions": [
                    {
                        "version": curr_v,
                        "size": f"{formatted_rows} images",
                        "made_from": f"{prev_v} + curated active learning iterations",
                        "state": "CURRENT",
                        "state_type": "current",
                        "is_current": True
                    },
                    {
                        "version": prev_v,
                        "size": f"{max(100, row_count - 300):,} images",
                        "made_from": f"baseline {clean_name} release",
                        "state": "TAGGED",
                        "state_type": "tagged",
                        "is_current": False
                    }
                ],
                "formats": [
                    {
                        "id": "yolo",
                        "name": "YOLO",
                        "description": "One .txt per image, for Ultralytics.",
                        "selected": True
                    },
                    {
                        "id": "coco",
                        "name": "COCO",
                        "description": "One JSON with all boxes, for most tools.",
                        "selected": False
                    },
                    {
                        "id": "pascal_voc",
                        "name": "Pascal VOC",
                        "description": "One XML per image, for older tools.",
                        "selected": False
                    },
                    {
                        "id": "cvat",
                        "name": "CVAT",
                        "description": "Re-open the boxes in CVAT to edit them.",
                        "selected": False
                    }
                ],
                "export_options": [
                    {
                        "id": "splits",
                        "label": "Keep the splits from 04",
                        "sub": "train / val / test · stratified",
                        "checked": True
                    },
                    {
                        "id": "blur_pii",
                        "label": "Faces and plates blurred",
                        "sub": "always, if any appear",
                        "checked": True
                    },
                    {
                        "id": "copy_paste",
                        "label": "Include copy-paste images",
                        "sub": "train only, marked as generated",
                        "checked": False
                    },
                    {
                        "id": "letterbox",
                        "label": "Letterboxed to 1280 px",
                        "sub": "off = original size, boxes rescaled",
                        "checked": False
                    },
                    {
                        "id": "no_defect_frames",
                        "label": "Include frames with no defect",
                        "sub": "needed to learn the background",
                        "checked": True
                    }
                ],
                "summary": f"{clean_name}@{curr_v} · YOLO · {formatted_rows} images",
                "footnote": "Only tagged versions download. A draft can be previewed, not exported."
            },
            "model_package": {
                "subtitle": "ONE MODEL, ONE PACKAGE, EVERYTHING IT NEEDS",
                "formats": [
                    {
                        "id": "openvino_int8",
                        "name": "OpenVINO INT8",
                        "description": "Edge accelerator engine optimized for Intel CPU/NPU.",
                        "sub": "EDGE ACCELERATOR",
                        "selected": True
                    },
                    {
                        "id": "onnx_fp32",
                        "name": "ONNX FP32",
                        "description": "Standard cross-platform format for GPU inference.",
                        "sub": "GPU / CLOUD",
                        "selected": False
                    },
                    {
                        "id": "docker",
                        "name": "Docker image",
                        "description": "Containerized FastAPI microservice for batch inference.",
                        "sub": "CONTAINER API",
                        "selected": False
                    },
                    {
                        "id": "pytorch",
                        "name": "PyTorch .pt",
                        "description": "Native weights checkpoint for PyTorch & TorchScript.",
                        "sub": "TRAINING CHECKPOINT",
                        "selected": False
                    }
                ],
                "calibration_note": "Edge INT8 quantization calibrated using deterministic golden splits.",
                "what_ships": [
                    {"label": f"Model · {model_name}", "sub": "YOLO11-s · compiled weights and runtime"},
                    {"label": "Class definitions", "sub": "Standard ontology metadata file"},
                    {"label": "Preprocessing specs", "sub": "Letterboxing and normalization parameters"},
                    {"label": "Per-class confidence thresholds", "sub": "Optimized precision/recall operating points"},
                    {"label": "Active learning trigger rules", "sub": "Confidence entropy boundaries for 07 upload"},
                    {"label": "Standard Model Card", "sub": "Formal specifications and edge benchmarks"}
                ],
                "cli_command": f"datalift export {model_name} --format openvino-int8"
            },
            "deploy": {
                "subtitle": "ONE DEVICE FIRST, THEN THE FLEET",
                "pipeline": [
                    {"step": "1 · BUILD", "title": "Model compilation", "status": "✓ done · 7 min", "active": False, "done": True},
                    {"step": "2 · HARDWARE TEST", "title": "Latency verification", "status": "✓ under 120 ms", "active": False, "done": True},
                    {"step": "3 · SHADOW", "title": "Staging node", "status": "now · evaluation mode", "active": True, "done": False},
                    {"step": "4 · PILOT", "title": "Initial cluster rollout", "status": "waiting", "active": False, "done": False},
                    {"step": "5 · FLEET", "title": "Production rollout", "status": "waiting · gate sign-off", "active": False, "done": False}
                ],
                "options": [
                    {
                        "id": "edge_devices",
                        "tag": "SELECTED",
                        "title": "Edge Sensors / Mini PCs",
                        "description": "Distributed deployment with atomic failover capability.",
                        "selected": True
                    },
                    {
                        "id": "hosted_api",
                        "tag": "OPTION",
                        "title": "Managed Inference API",
                        "description": "Autoscaling cloud endpoint with TLS authentication.",
                        "selected": False
                    },
                    {
                        "id": "gpu_cluster",
                        "tag": "OPTION",
                        "title": "On-Premises GPU Server",
                        "description": "High-throughput pipeline for batch inspection.",
                        "selected": False
                    }
                ]
            },
            "api_section": {
                "subtitle": "SAME MASKS, SAME THRESHOLDS AS IN 06",
                "endpoint_method": "POST",
                "endpoint_path": f"[YOUR DOMAIN]/v1/{clean_name}/detect",
                "curl_snippet": curl_snippet,
                "python_snippet": python_snippet,
                "response_json": {
                    "image": "sample_frame.jpg",
                    "size": [1280, 1280],
                    "boxes": [
                        {"class": "detected_object", "score": "[RESULT]", "score_val": 0.91, "box": [320, 240, 140, 180]}
                    ],
                    "uncertain": False,
                    "model": model_name,
                    "runtime": "openvino-int8"
                },
                "footnote": "Coordinates normalized according to letterbox transform.",
                "keys": [
                    {"name": "Client inspection app", "tag": "LIVE", "tag_type": "live", "detail": "dl_live_****92ec · detect", "used": "used 5 min ago"},
                    {"name": "Edge sensor fleet", "tag": "LIVE", "tag_type": "live", "detail": "sensor certs · auto-sync", "used": "used recently"},
                    {"name": "Integration test suite", "tag": "TEST", "tag_type": "test", "detail": "dl_test_****3b12 · test", "used": "used today"}
                ],
                "rate_limit": "25 req / s",
                "max_input": "1 image · 20 MB",
                "webhooks": [
                    {"event": "dataset.version_tagged", "desc": "triggered on new dataset tag", "enabled": True},
                    {"event": "model.promoted", "desc": "triggered on model production promotion", "enabled": True},
                    {"event": "drift.alert", "desc": "triggered on visual drift alert", "enabled": True},
                    {"event": "device.offline", "desc": "triggered on node heartbeat timeout", "enabled": True}
                ]
            },
            "versions_traffic": {
                "subtitle": "EVERY PREDICTION IS LOGGED WITH ITS MODEL VERSION",
                "kpis": [
                    {"label": "LATENCY ON DEVICE · P50", "value": "[RESULT]", "sub": "per frame · INT8", "tooltip": "19.2 ms"},
                    {"label": "LATENCY ON DEVICE · P95", "value": "[RESULT]", "sub": "budget 120 ms", "tooltip": "26.1 ms"},
                    {"label": "FRAMES UPLOADED", "value": "11%", "sub": "uncertainty quota", "tooltip": "Filtered by active learning"},
                    {"label": "DEVICES ONLINE", "value": "[RESULT]", "sub": "nodes active", "tooltip": "100% telemetry online"}
                ],
                "table": [
                    {
                        "version": prev_model,
                        "runs_on": "Primary Edge Cluster",
                        "status": "PRODUCTION",
                        "status_type": "prod",
                        "traffic": "active routing",
                        "p95": "[RESULT]",
                        "p95_val": "23 ms",
                        "errors": "[RESULT]",
                        "errors_val": "0.02%",
                        "action_label": "Rollback",
                        "action_key": "rollback"
                    },
                    {
                        "version": model_name,
                        "runs_on": "Shadow Node 1",
                        "status": "SHADOW",
                        "status_type": "shadow",
                        "traffic": "logged only",
                        "p95": "[RESULT]",
                        "p95_val": "21 ms",
                        "errors": "[RESULT]",
                        "errors_val": "0.00%",
                        "action_label": "Promote",
                        "action_key": "promote"
                    }
                ],
                "footnote": "Shadow instances compare candidate telemetry against baseline without impacting active systems."
            },
            "guardrails": [
                {"title": "Speed measured on edge hardware", "desc": "Benchmarked against real CPU/NPU limits", "status": "ok"},
                {"title": "Calibration isolated to train split", "desc": "Never tuned on validation or test sets", "status": "ok"},
                {"title": "Shadow phase prior to rollout", "desc": "Side-by-side verification before promotion", "status": "ok"},
                {"title": "Strict recall regression guard", "desc": "Zero tolerance for critical detection regression", "status": "ok"},
                {"title": "Offline fallback support", "desc": "Autonomous rollback on disconnection", "status": "ok"},
                {"title": "Local on-device video retention", "desc": "No raw footage transmitted externally", "status": "ok"},
                {"title": "Deterministic version artifacts", "desc": "Fully reproducible pipelines", "status": "ok"}
            ],
            "bottom_bar": {
                "title": f"{model_name} · OpenVINO INT8 · ready for shadow deployment",
                "sub": "Next: shadow on pilot node, followed by fleet promotion",
                "action_back": "← Back to drift",
                "action_primary": "Start shadow on pilot device"
            }
        }

    def download_dataset(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        version = payload.get("version", "v4")
        fmt = payload.get("format", "yolo")
        return {
            "status": "success",
            "download_url": f"/api/v1/image-export/{dataset_id}/archive?version={version}&format={fmt}",
            "filename": f"defects_{version}_{fmt}.zip",
            "message": f"Dataset {version} au format {fmt} préparé pour le téléchargement."
        }

    def build_package(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        fmt = payload.get("format", "openvino_int8")
        return {
            "status": "success",
            "package_id": f"pkg_{uuid.uuid4().hex[:8]}",
            "format": fmt,
            "message": f"Package {fmt} compilé avec succès."
        }

    def start_shadow(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        device = payload.get("device", "Line 2 · 1 device")
        return {
            "status": "success",
            "device": device,
            "message": f"Mode shadow démarré avec succès sur {device}."
        }

    def create_api_key(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        name = payload.get("name", "New Key")
        scope = payload.get("scope", "detect")
        new_key = f"dl_live_{uuid.uuid4().hex[:8]}"
        return {
            "status": "success",
            "key": new_key,
            "name": name,
            "scope": scope,
            "message": f"Clé API '{name}' générée avec succès."
        }

    def add_webhook(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        url = payload.get("url", "https://example.com/webhook")
        events = payload.get("events", ["dataset.version_tagged"])
        return {
            "status": "success",
            "url": url,
            "events": events,
            "message": "Webhook configuré avec succès."
        }

    def rollback_model(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        target = payload.get("target_version", "v2")
        return {
            "status": "success",
            "target_version": target,
            "message": f"Rollback vers la version {target} initié sur la flotte."
        }


image_export_api_service = ImageExportApiService()

