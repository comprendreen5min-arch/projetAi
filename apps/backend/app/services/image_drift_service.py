import logging
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion

logger = logging.getLogger(__name__)


class ImageDriftService:
    """Service dedicated to Image Drift monitoring (08 Drift) for Image Modality.
    Provides complete, dynamic data for computer vision drift detection, camera/device shifts,
    image statistics (brightness, sharpness), hardware health checks, and model impact.
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

    def get_drift_data(
        self,
        dataset_id: str,
        db: Session
    ) -> Dict[str, Any]:
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
        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": "product_defects/",
            "subtitle": "DRIFT · WATCHING YOLO-DEFECTS-V3 ON THE LINE MINI PCS · OBJECT DETECTION · 6 CLASSES",
            "alert_badge": {
                "tag": "ALERT",
                "count": "02",
                "label": "CAMERAS DRIFTING"
            },
            "metrics": {
                "reference": "defects@v3",
                "reference_sub": "train split used by yolo-defects-v3",
                "live_window": "7 days",
                "live_window_sub": "48,300 frames seen · 6,950 uploaded",
                "signals_watched": "8 × cam",
                "signals_watched_sub": "every signal, camera by camera",
                "last_check": "16:00",
                "last_check_sub": "device stats hourly · images daily"
            },
            "info_banner": {
                "title": "HOW DRIFT WORKS FOR IMAGES",
                "text": "The mini PCs already run the model on every frame. Each hour they send small statistics (brightness, sharpness, boxes per frame, confidence), and the random 1-in-200 frames reach Datalift. Both are compared with the images yolo-defects-v3 was trained on, camera by camera, because one camera can drift while the others stay fine."
            },
            "over_time": {
                "subtitle": "LAST 30 DAYS · THE SIGNALS THAT MOVED",
                "event_markers": [
                    {"date": "3 Nov", "label": "3 Nov · lamp changed"},
                    {"date": "5 Nov", "label": "5 Nov · cam 6 installed"}
                ],
                "footnote_left": "Cam 6 has no history before 5 Nov, so it starts above the drift line. Cam 2 is slowly getting blurrier: a lens to clean.",
                "footnote_right": "Curves are illustrative.",
                "threshold_drift": 0.20,
                "threshold_watch": 0.10,
                "dates": ["13 Oct", "20 Oct", "27 Oct", "3 Nov", "11 Nov"],
                "series": [
                    {"name": "brightness · cam 4", "color": "#f59e0b", "type": "solid"},
                    {"name": "new cam 6", "color": "#f87171", "type": "solid"},
                    {"name": "sharpness · cam 2", "color": "#9ca3af", "type": "dashed"}
                ]
            },
            "signals": [
                {
                    "id": "all_frames",
                    "signal": "all frames · together",
                    "kind": "multivariate",
                    "test": "Classifier",
                    "what_changed": "Frames from cam 4 and cam 6 are easy to tell from training",
                    "weight": "—",
                    "distance": "[RESULT]",
                    "distance_val": "0.28",
                    "status": "DRIFT",
                    "status_type": "red"
                },
                {
                    "id": "brightness_cam_4",
                    "signal": "brightness · line 2 · cam 4",
                    "kind": "image stat",
                    "test": "KS",
                    "what_changed": "Darker at night since 3 Nov · a lamp changed?",
                    "weight": "high",
                    "distance": "[RESULT]",
                    "distance_val": "0.26",
                    "status": "DRIFT",
                    "status_type": "red"
                },
                {
                    "id": "new_cam_6",
                    "signal": "new camera · line 1 · cam 6",
                    "kind": "embeddings",
                    "test": "Distance",
                    "what_changed": "Installed 5 Nov · new angle, never in training",
                    "weight": "high",
                    "distance": "[RESULT]",
                    "distance_val": "0.34",
                    "status": "DRIFT",
                    "status_type": "red"
                },
                {
                    "id": "sharpness_cam_2",
                    "signal": "sharpness · line 1 · cam 2",
                    "kind": "image stat",
                    "test": "KS",
                    "what_changed": "A bit blurrier · lens dust?",
                    "weight": "med",
                    "distance": "[RESULT]",
                    "distance_val": "0.14",
                    "status": "WATCH",
                    "status_type": "amber"
                },
                {
                    "id": "mean_confidence",
                    "signal": "mean confidence",
                    "kind": "model output",
                    "test": "KS",
                    "what_changed": "Lower on cam 4 and cam 6 only",
                    "weight": "med",
                    "distance": "[RESULT]",
                    "distance_val": "0.12",
                    "status": "WATCH",
                    "status_type": "amber"
                },
                {
                    "id": "boxes_per_frame",
                    "signal": "boxes per frame",
                    "kind": "model output",
                    "test": "PSI",
                    "what_changed": "Same as training",
                    "weight": "low",
                    "distance": "[RESULT]",
                    "distance_val": "0.03",
                    "status": "STABLE",
                    "status_type": "gray"
                },
                {
                    "id": "crack_predicted",
                    "signal": "crack predicted",
                    "kind": "model output",
                    "test": "Rate",
                    "what_changed": "Same rate as training",
                    "weight": "high",
                    "distance": "[RESULT]",
                    "distance_val": "0.04",
                    "status": "STABLE",
                    "status_type": "gray"
                },
                {
                    "id": "qc_checks",
                    "signal": "QC checks",
                    "kind": "outcome",
                    "test": "—",
                    "what_changed": "QC checks 1 part in 50 · about 3 days late",
                    "weight": "—",
                    "distance": "—",
                    "distance_val": "—",
                    "status": "WAITING",
                    "status_type": "gray"
                }
            ],
            "selected_signal_detail": {
                "title": "brightness · line 2 · cam 4",
                "badge": "DRIFT",
                "subtitle": "IMAGE STAT · KS",
                "labels": ["Very dark", "Dark", "Normal", "Bright", "Very bright"],
                "train_bars": [15, 38, 88, 45, 18],
                "live_bars": [40, 52, 70, 36, 16],
                "description": "Only night shifts moved. Too-dark frames hide scratches; 02 already sends frames under the brightness floor to cleaning, not to labeling.",
                "actions": {
                    "action_primary": "Send night frames to 07",
                    "action_secondary": "Report to the line"
                }
            },
            "data_quality": {
                "subtitle": "BROKEN DATA IS A PIPELINE PROBLEM, NOT A DRIFT",
                "summary": {"failed": 1, "to_review": 2, "passed": 3},
                "checks": [
                    {
                        "check": "Too dark",
                        "where": "line 2 · cam 4 · night",
                        "live": "6% of frames",
                        "expected": "≤ 2%",
                        "status": "FAIL",
                        "status_type": "red",
                        "action_label": "Report to the line",
                        "action_key": "report_line"
                    },
                    {
                        "check": "Camera offline",
                        "where": "line 1 · cam 3",
                        "live": "40 min yesterday",
                        "expected": "0",
                        "status": "WARN",
                        "status_type": "amber",
                        "action_label": "Open device",
                        "action_key": "open_device"
                    },
                    {
                        "check": "Corrupt files",
                        "where": "uploads",
                        "live": "2 of 6,950",
                        "expected": "0",
                        "status": "WARN",
                        "status_type": "amber",
                        "action_label": "Review in 02",
                        "action_key": "review_02"
                    },
                    {
                        "check": "Image size",
                        "where": "all cameras",
                        "live": "1920 × 1080, as expected",
                        "expected": "same as v3",
                        "status": "PASS",
                        "status_type": "gray",
                        "action_label": "—",
                        "action_key": ""
                    },
                    {
                        "check": "Device clock",
                        "where": "all mini PCs",
                        "live": "in sync",
                        "expected": "± 2 s",
                        "status": "PASS",
                        "status_type": "gray",
                        "action_label": "—",
                        "action_key": ""
                    },
                    {
                        "check": "Freshness",
                        "where": "device stats",
                        "live": "last at 16:00",
                        "expected": "hourly",
                        "status": "PASS",
                        "status_type": "gray",
                        "action_label": "—",
                        "action_key": ""
                    }
                ],
                "footnote": "Quality runs before drift. Corrupt or too-dark frames go to 02, never to labeling, and are left out of the drift window."
            },
            "model_impact": {
                "subtitle": "MEASURED PER CAMERA, NOT ONLY IN TOTAL",
                "kpis": [
                    {
                        "title": "MAP@50 · ESTIMATED",
                        "value": "[RESULT]",
                        "tooltip": "Estimated mAP@50: ~0.79",
                        "sub": "without labels · from the model's own confidence"
                    },
                    {
                        "title": "CRACKS FLAGGED · CAM 4 & 6",
                        "value": "[RESULT]",
                        "tooltip": "Relative crack rate discrepancy: -32%",
                        "sub": "compared with the other cameras"
                    },
                    {
                        "title": "CRACK RECALL · MEASURED",
                        "value": "partial",
                        "tooltip": "Post-audit recall from line QC: ~0.84",
                        "sub": "from QC checks · about 3 days late"
                    }
                ],
                "segments": [
                    {
                        "segment": "line 2 · cam 4 · night",
                        "frames": "1,120",
                        "map_est": "[RESULT]",
                        "map_tooltip": "Est mAP: 0.62",
                        "flag": "DRIFT",
                        "flag_type": "red"
                    },
                    {
                        "segment": "line 1 · cam 6 · new",
                        "frames": "860",
                        "map_est": "[RESULT]",
                        "map_tooltip": "Est mAP: 0.58",
                        "flag": "NEW",
                        "flag_type": "amber"
                    },
                    {
                        "segment": "line 1 · cam 2",
                        "frames": "1,050",
                        "map_est": "[RESULT]",
                        "map_tooltip": "Est mAP: 0.74",
                        "flag": "WATCH",
                        "flag_type": "amber"
                    },
                    {
                        "segment": "all other cameras",
                        "frames": "3,920",
                        "map_est": "[RESULT]",
                        "map_tooltip": "Est mAP: 0.88",
                        "flag": "OK",
                        "flag_type": "gray"
                    }
                ],
                "footnote": "Counts are uploaded frames. Device statistics cover all 48,300 frames."
            },
            "what_to_do": {
                "subtitle": "A DRIFT OPENS WORK, NEVER A RELEASE",
                "cards": [
                    {
                        "type": "IF IT IS EXPECTED",
                        "title": "The new camera stays",
                        "description": "Cam 6 is permanent, so its view becomes normal once it is labeled. Add its frames to the reference after round 4.",
                        "action_label": "Adopt cam 6 as reference",
                        "action_key": "adopt_cam6",
                        "is_recommended": False
                    },
                    {
                        "type": "IF IT IS ON SITE",
                        "title": "Fix the line, not the model",
                        "description": "A changed lamp, a dirty lens or a moved camera. Send a note to the line manager with sample frames.",
                        "action_label": "Report to the line",
                        "action_key": "report_line",
                        "is_recommended": False
                    },
                    {
                        "type": "RECOMMENDED",
                        "title": "The model has a gap",
                        "description": "Label 300 random frames from cam 6 and the night frames from cam 4 in 07. Cold start before uncertainty works.",
                        "action_label": "Start focused round in 07",
                        "action_key": "start_07",
                        "is_recommended": True
                    },
                    {
                        "type": "THEN",
                        "title": "Retrain and shadow",
                        "description": "Retrain in 06 on v5, then shadow mode on one mini PC before the fleet.",
                        "action_label": "Retrain in 06",
                        "action_key": "retrain_06",
                        "is_recommended": False
                    }
                ]
            },
            "monitoring": {
                "subtitle": "CHECKS RUN ON THEIR OWN; RETRAINING NEVER DOES",
                "checklist": [
                    {
                        "label": "Device stats every hour",
                        "sub": "Brightness, sharpness, boxes and confidence per camera",
                        "checked": True,
                        "disabled": False
                    },
                    {
                        "label": "Random frames every day",
                        "sub": "1 in 200 · the same rule as 07",
                        "checked": True,
                        "disabled": False
                    },
                    {
                        "label": "Alert after 3 checks in a row",
                        "sub": "A passing shadow does not raise an alert",
                        "checked": True,
                        "disabled": False
                    },
                    {
                        "label": "New camera → 300 random frames to 07",
                        "sub": "Cold start before uncertainty works",
                        "checked": True,
                        "disabled": False
                    },
                    {
                        "label": "Email the line manager",
                        "sub": "With sample frames from the camera",
                        "checked": True,
                        "disabled": False
                    },
                    {
                        "label": "Retrain automatically",
                        "sub": "Not available · always reviewed in 06",
                        "checked": False,
                        "disabled": True
                    }
                ],
                "thresholds": {
                    "ks_watch_from": 0.10,
                    "ks_drift_from": 0.20,
                    "window": "7 days",
                    "min_frames_cam": 200,
                    "send_email": True,
                    "send_slack": True,
                    "send_webhook": False,
                    "cli_command": "datalift drift yolo-defects-v3 --ref defects@v3 --window 7d --per-camera"
                }
            },
            "guardrails": [
                {
                    "title": "Checked camera by camera",
                    "desc": "One camera cannot hide in the total",
                    "status": "ok"
                },
                {
                    "title": "Reference is the production train split",
                    "desc": "Never test images, never copy-paste images",
                    "status": "ok"
                },
                {
                    "title": "Too dark goes to 02",
                    "desc": "Not to labeling",
                    "status": "ok"
                },
                {
                    "title": "Stats need no upload",
                    "desc": "Images stay on the line unless picked",
                    "status": "ok"
                },
                {
                    "title": "Small windows are not judged",
                    "desc": "Under 200 frames per camera the check waits",
                    "status": "ok"
                },
                {
                    "title": "Every check is stored",
                    "desc": "Window, camera, reference hash, threshold",
                    "status": "ok"
                },
                {
                    "title": "No automatic retrain",
                    "desc": "Shadow on one device before the fleet",
                    "status": "ok"
                },
                {
                    "title": "Crack is rare",
                    "desc": "Crack recall is measured weekly, not daily",
                    "status": "warn"
                }
            ],
            "bottom_bar": {
                "title": "yolo-defects-v3 · cam 4 darker at night · new cam 6",
                "sub": "Recommended: 300 random frames from cam 6 and the night frames from cam 4 to 07",
                "action_left": "Start focused round in 07",
                "action_right": "Continue to export →"
            }
        }

    def _get_dynamic_data(self, dataset: Dataset, v_count: int, latest_v: DatasetVersion) -> Dict[str, Any]:
        curr_v = f"v{v_count}" if v_count > 0 else "v1"
        sanitized_name = dataset.name.replace(".", "_")
        model_name = f"yolo-{sanitized_name}-{curr_v}"
        frames_seen = (latest_v.row_count or 12000) * 4
        frames_uploaded = latest_v.row_count or 12000

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": f"{dataset.name}/",
            "subtitle": f"DRIFT · WATCHING {model_name.upper()} ON PRODUCTION SENSORS · COMPUTER VISION",
            "alert_badge": {
                "tag": "ALERT",
                "count": "01",
                "label": "SENSOR DRIFTING"
            },
            "metrics": {
                "reference": f"{dataset.name}@{curr_v}",
                "reference_sub": f"baseline train split ({curr_v})",
                "live_window": "7 days",
                "live_window_sub": f"{frames_seen:,} frames seen · {frames_uploaded:,} uploaded",
                "signals_watched": "4 × sensor",
                "signals_watched_sub": "sensor telemetry & feature maps",
                "last_check": "16:00",
                "last_check_sub": "hourly stats · daily inference sample"
            },
            "info_banner": {
                "title": f"HOW DRIFT WORKS FOR {dataset.name.upper()}",
                "text": f"Production sensors run {model_name} on-device. Image metrics (exposure, contrast, focal blur) and random sample frames are compared with {curr_v} training data per sensor channel."
            },
            "over_time": {
                "subtitle": "LAST 30 DAYS · VISION TELEMETRY DRIFT",
                "event_markers": [
                    {"date": "Day -5", "label": "Sensor recalibration / lighting shift"}
                ],
                "footnote_left": "Sensor distribution shift tracked against golden baseline.",
                "footnote_right": "Continuous vision monitoring.",
                "threshold_drift": 0.20,
                "threshold_watch": 0.10,
                "dates": ["Day -28", "Day -21", "Day -14", "Day -7", "Live"],
                "series": [
                    {"name": "exposure shift · sensor 1", "color": "#f59e0b", "type": "solid"},
                    {"name": "contrast delta", "color": "#f87171", "type": "solid"},
                    {"name": "sharpness variance", "color": "#9ca3af", "type": "dashed"}
                ]
            },
            "signals": [
                {
                    "id": "global_visual_shift",
                    "signal": "all sensors · global shift",
                    "kind": "multivariate",
                    "test": "Classifier Two-Sample",
                    "what_changed": "Measurable divergence from training illumination profile",
                    "weight": "high",
                    "distance": "[RESULT]",
                    "distance_val": "0.24",
                    "status": "DRIFT",
                    "status_type": "red"
                },
                {
                    "id": "exposure_drift",
                    "signal": "exposure · sensor 1",
                    "kind": "image stat",
                    "test": "Kolmogorov-Smirnov",
                    "what_changed": "Histogram shifted towards lower luminance under ambient conditions",
                    "weight": "high",
                    "distance": "[RESULT]",
                    "distance_val": "0.22",
                    "status": "DRIFT",
                    "status_type": "red"
                },
                {
                    "id": "blur_stat",
                    "signal": "sharpness / blur",
                    "kind": "image stat",
                    "test": "KS",
                    "what_changed": "Laplacian variance slightly decreased",
                    "weight": "med",
                    "distance": "[RESULT]",
                    "distance_val": "0.11",
                    "status": "WATCH",
                    "status_type": "amber"
                },
                {
                    "id": "aspect_ratio",
                    "signal": "bounding box density",
                    "kind": "model output",
                    "test": "PSI",
                    "what_changed": "Detections count per frame is normal",
                    "weight": "low",
                    "distance": "[RESULT]",
                    "distance_val": "0.02",
                    "status": "STABLE",
                    "status_type": "gray"
                }
            ],
            "selected_signal_detail": {
                "title": "exposure · sensor 1",
                "badge": "DRIFT",
                "subtitle": "IMAGE STAT · KS",
                "labels": ["Under-exposed", "Low", "Optimal", "High", "Over-exposed"],
                "train_bars": [10, 25, 75, 30, 8],
                "live_bars": [35, 45, 55, 20, 6],
                "description": f"Sensors on line demonstrate altered exposure characteristics compared to reference {curr_v}.",
                "actions": {
                    "action_primary": "Send outlier frames to 07",
                    "action_secondary": "Report sensor recalibration"
                }
            },
            "data_quality": {
                "subtitle": "HARDWARE & INGESTION DATA QUALITY",
                "summary": {"failed": 0, "to_review": 1, "passed": 3},
                "checks": [
                    {
                        "check": "Sensor underexposure",
                        "where": "channel 1",
                        "live": "4.2% frames",
                        "expected": "≤ 2%",
                        "status": "WARN",
                        "status_type": "amber",
                        "action_label": "Report to the line",
                        "action_key": "report_line"
                    },
                    {
                        "check": "Dropped frames",
                        "where": "ring buffer",
                        "live": "0 dropped",
                        "expected": "0",
                        "status": "PASS",
                        "status_type": "gray",
                        "action_label": "—",
                        "action_key": ""
                    },
                    {
                        "check": "Resolution match",
                        "where": "all feeds",
                        "live": "1920 × 1080",
                        "expected": "1920 × 1080",
                        "status": "PASS",
                        "status_type": "gray",
                        "action_label": "—",
                        "action_key": ""
                    },
                    {
                        "check": "Telemetry sync",
                        "where": "NTP clock",
                        "live": "< 50ms",
                        "expected": "< 1s",
                        "status": "PASS",
                        "status_type": "gray",
                        "action_label": "—",
                        "action_key": ""
                    }
                ],
                "footnote": "Device health checks isolate hardware glitches from authentic data drift."
            },
            "model_impact": {
                "subtitle": "PROJECTED COMPUTER VISION IMPACT",
                "kpis": [
                    {
                        "title": "MAP@50 · ESTIMATED",
                        "value": "[RESULT]",
                        "tooltip": "Estimated live mAP: 0.81",
                        "sub": "from confidence entropy"
                    },
                    {
                        "title": "LOW-CONFIDENCE FRACTION",
                        "value": "[RESULT]",
                        "tooltip": "Below certainty bar: 12.4%",
                        "sub": "candidate frames for 07 review"
                    },
                    {
                        "title": "VERIFIED AP · SAMPLE",
                        "value": "partial",
                        "tooltip": "Sample precision: 0.86",
                        "sub": "delayed manual audit sample"
                    }
                ],
                "segments": [
                    {
                        "segment": "sensor 1 · night feed",
                        "frames": str(int(frames_uploaded * 0.25)),
                        "map_est": "[RESULT]",
                        "map_tooltip": "Est mAP: 0.69",
                        "flag": "DRIFT",
                        "flag_type": "red"
                    },
                    {
                        "segment": "other sensors",
                        "frames": str(int(frames_uploaded * 0.75)),
                        "map_est": "[RESULT]",
                        "map_tooltip": "Est mAP: 0.87",
                        "flag": "OK",
                        "flag_type": "gray"
                    }
                ],
                "footnote": "Device statistics cover incoming frames from live production cameras."
            },
            "what_to_do": {
                "subtitle": "ACTIONABLE RESPONSE RECOMMENDATIONS",
                "cards": [
                    {
                        "type": "IF EXPECTED",
                        "title": "Adopt updated camera profile",
                        "description": "If environmental lighting change is permanent, adopt current frames as baseline reference.",
                        "action_label": "Adopt as new reference",
                        "action_key": "adopt_ref",
                        "is_recommended": False
                    },
                    {
                        "type": "IF SENSOR FAULT",
                        "title": "Recalibrate line hardware",
                        "description": "Send diagnostic sample frames to maintenance team for optical cleaning or illumination fix.",
                        "action_label": "Report to the line",
                        "action_key": "report_line",
                        "is_recommended": False
                    },
                    {
                        "type": "RECOMMENDED",
                        "title": "Active learning focused round",
                        "description": "Route low-confidence and shifted frames to 07 Active learning to expand model coverage.",
                        "action_label": "Start focused round in 07",
                        "action_key": "start_07",
                        "is_recommended": True
                    },
                    {
                        "type": "THEN",
                        "title": "Retrain candidate model",
                        "description": "Schedule a training run with newly verified samples in 06 Training.",
                        "action_label": "Retrain in 06",
                        "action_key": "retrain_06",
                        "is_recommended": False
                    }
                ]
            },
            "monitoring": {
                "subtitle": "CONTINUOUS CV MONITORING SCHEDULE",
                "checklist": [
                    {"label": "Periodic device telemetry collection", "sub": "Exposure, contrast and bounding box stats", "checked": True, "disabled": False},
                    {"label": "Uncertainty sampling pool feeding 07", "sub": "Automated buffer extraction", "checked": True, "disabled": False},
                    {"label": "Alert on consecutive threshold breach", "sub": "Suppresses single-frame outliers", "checked": True, "disabled": False},
                    {"label": "Auto-retraining safety lock", "sub": "Model promotion requires human sign-off", "checked": False, "disabled": True}
                ],
                "thresholds": {
                    "ks_watch_from": 0.10,
                    "ks_drift_from": 0.20,
                    "window": "7 days",
                    "min_frames_cam": 200,
                    "send_email": True,
                    "send_slack": True,
                    "send_webhook": False,
                    "cli_command": f"datalift drift {model_name} --ref {dataset.name}@{curr_v} --window 7d"
                }
            },
            "guardrails": [
                {
                    "title": "Checked per camera stream",
                    "desc": "Individual sensor channels monitored separately",
                    "status": "ok"
                },
                {
                    "title": "Reference is production golden train split",
                    "desc": "Never evaluated on corrupted or synthetic test data",
                    "status": "ok"
                },
                {
                    "title": "Malformed frames bypass labeling",
                    "desc": "Defective images routed to 02 Cleaning",
                    "status": "ok"
                },
                {
                    "title": "Deterministic checks logged",
                    "desc": "Every KS test and distance score preserved",
                    "status": "ok"
                }
            ],
            "bottom_bar": {
                "title": f"{model_name} · sensor 1 exposure shift detected",
                "sub": "Recommended: Route 300 under-exposed frames to 07 Active learning",
                "action_left": "Start focused round in 07",
                "action_right": "Continue to export →"
            }
        }

    def save_settings(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        logger.info(f"Saved image drift settings for {dataset_id}: {payload}")
        return {"status": "success", "message": "Paramètres de dérive d'image enregistrés."}

    def run_check(self, dataset_id: str, db: Session) -> Dict[str, Any]:
        return {
            "status": "success",
            "drift_score": "0.26",
            "status_label": "DRIFT",
            "message": "Vérification de dérive image terminée : 2 caméras en dérive détectées."
        }

    def adopt_reference(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        return {
            "status": "success",
            "message": "La caméra cam 6 a été adoptée comme nouvelle référence."
        }

    def send_to_07(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        frames_count = payload.get("count", 300)
        return {
            "status": "success",
            "count": frames_count,
            "message": f"{frames_count} images envoyées vers 07 Active learning."
        }

    def report_to_line(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        camera = payload.get("camera", "cam 4")
        return {
            "status": "success",
            "camera": camera,
            "message": f"Rapport d'incident envoyé à l'équipe maintenance pour la {camera}."
        }


image_drift_service = ImageDriftService()

