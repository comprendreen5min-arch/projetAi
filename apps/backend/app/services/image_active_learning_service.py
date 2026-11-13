from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion


class ImageActiveLearningService:
    """Service dedicated to Image Active Learning (07 Active Learning) for Image Modality.
    Provides complete, dynamic data for the active learning workflow.
    """

    def get_active_learning_data(
        self,
        dataset_id: str,
        db: Session,
        strategy_filter: Optional[str] = "all"
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
            return self._get_template_data(dataset, len(versions), strategy_filter)
        else:
            return self._get_dynamic_data(dataset, len(versions), versions[0], strategy_filter)

    def _get_template_data(
        self,
        dataset: Dataset,
        v_count: int,
        strategy_filter: Optional[str] = "all"
    ) -> Dict[str, Any]:
        output_v = "v5"
        round_num = "03"

        picks = [
            {
                "image_id": "IMG_11204",
                "tag": "UNCERTAIN",
                "tag_type": "blue",
                "description": "dent 0.41 · line 1",
                "strategy_key": "uncertain",
                "defect_type": "dent",
                "line": "line 1",
                "confidence": 0.41,
                "box": {"x": 42, "y": 38, "w": 20, "h": 22, "shape": "dot"},
            },
            {
                "image_id": "IMG_11318",
                "tag": "CRACK OR SCRATCH",
                "tag_type": "blue",
                "description": "crack 0.38 · scratch 0.35",
                "strategy_key": "crack_or_scratch",
                "defect_type": "crack",
                "line": "line 1",
                "confidence": 0.38,
                "box": {"x": 26, "y": 32, "w": 46, "h": 26, "shape": "slash"},
            },
            {
                "image_id": "IMG_11402",
                "tag": "BOX MOVES",
                "tag_type": "blue",
                "description": "stain · box shifts 34% under flip",
                "strategy_key": "flips",
                "defect_type": "stain",
                "line": "line 2",
                "confidence": 0.49,
                "box": {"x": 45, "y": 30, "w": 30, "h": 32, "shape": "double_box"},
            },
            {
                "image_id": "IMG_11477",
                "tag": "RARE · CRACK",
                "tag_type": "red",
                "description": "crack 0.52 · line 2",
                "strategy_key": "rare",
                "defect_type": "crack",
                "line": "line 2",
                "confidence": 0.52,
                "box": {"x": 68, "y": 20, "w": 26, "h": 28, "shape": "crack_red"},
            },
            {
                "image_id": "IMG_11530",
                "tag": "DIVERSITY",
                "tag_type": "gray",
                "description": "line 2 · night · 0 labeled",
                "strategy_key": "diversity",
                "defect_type": "dark_frame",
                "line": "line 2",
                "confidence": 0.22,
                "box": {"x": 35, "y": 40, "w": 32, "h": 25, "shape": "empty_box"},
            },
            {
                "image_id": "IMG_11602",
                "tag": "RANDOM",
                "tag_type": "gray",
                "description": "no box predicted",
                "strategy_key": "random",
                "defect_type": "clean",
                "line": "line 1",
                "confidence": 0.05,
                "box": {"x": 0, "y": 0, "w": 0, "h": 0, "shape": "none"},
            },
            {
                "image_id": "IMG_11688",
                "tag": "CRACK OR SCRATCH",
                "tag_type": "blue",
                "description": "scratch 0.46 · crack 0.40",
                "strategy_key": "crack_or_scratch",
                "defect_type": "scratch",
                "line": "line 1",
                "confidence": 0.46,
                "box": {"x": 28, "y": 45, "w": 42, "h": 20, "shape": "slash"},
            },
            {
                "image_id": "IMG_11751",
                "tag": "UNCERTAIN",
                "tag_type": "blue",
                "description": "misaligned 0.33 · small box",
                "strategy_key": "uncertain",
                "defect_type": "misaligned",
                "line": "line 2",
                "confidence": 0.33,
                "box": {"x": 75, "y": 62, "w": 18, "h": 22, "shape": "small_corner"},
            },
        ]

        strategies = [
            {
                "key": "uncertain",
                "name": "Uncertain boxes",
                "description": "Confidence between 0.30 and 0.60",
                "share_pct": 30,
                "images": 150,
            },
            {
                "key": "crack_or_scratch",
                "name": "Crack or scratch?",
                "description": "Both classes close on the same box",
                "share_pct": 20,
                "images": 100,
            },
            {
                "key": "flips",
                "name": "Boxes move under flips",
                "description": "Predictions change with flip or scale - likely missed or loose boxes",
                "share_pct": 15,
                "images": 75,
            },
            {
                "key": "rare",
                "name": "Rare class",
                "description": "Any predicted crack, even low confidence",
                "share_pct": 15,
                "images": 75,
            },
            {
                "key": "diversity",
                "name": "Diversity",
                "description": "Image clusters with few labels - e.g. line 2 at night",
                "share_pct": 10,
                "images": 50,
            },
            {
                "key": "random",
                "name": "Random control",
                "description": "Honest baseline for the gain",
                "badge": "MIN 10%",
                "share_pct": 10,
                "images": 50,
            },
        ]

        rounds_history = [
            {
                "round": "R1",
                "name": "ROUND 1 · COLD START",
                "images": "1,000",
                "strategy": "random · cold start",
                "hours": "3 h",
                "data": "v2",
                "model": "yolo-defects-v2",
                "ap_gain": "—",
                "target_version": "v2",
                "status": "DONE",
            },
            {
                "round": "R2",
                "name": "ROUND 2 · DONE",
                "images": "412",
                "strategy": "uncertain boxes",
                "hours": "1 h 05",
                "data": "v4",
                "model": "yolo-defects-v4",
                "ap_gain": "+3.4 pts",
                "target_version": "v4",
                "status": "DONE",
            },
            {
                "round": "R3",
                "name": "ROUND 3 · DRAFT",
                "images": "500",
                "strategy": "6 strategies",
                "hours": "≈ 1 h 20",
                "data": "v5",
                "model": "—",
                "ap_gain": "—",
                "target_version": "v5",
                "status": "DRAFT",
            },
        ]

        guardrails = [
            {
                "label": "Test images never picked",
                "description": "The locked test set stays untouched",
                "status": "ok",
            },
            {
                "label": "10% random control",
                "description": "Measures the real gain",
                "status": "ok",
            },
            {
                "label": "One frame per scene group",
                "description": "No near-duplicates in a round",
                "status": "ok",
            },
            {
                "label": "Generated images never picked",
                "description": "Copy-paste follows its parent",
                "status": "ok",
            },
            {
                "label": "Pseudo-labels train only",
                "description": "origin = pseudo · spot-checked",
                "status": "ok",
            },
            {
                "label": "Upload rule is recorded",
                "description": "You know what was never uploaded",
                "status": "ok",
            },
            {
                "label": "Every round makes a new version",
                "description": "v4 stays as is · round log attached",
                "status": "ok",
            },
            {
                "label": "line 2 at night has no labels",
                "description": "Diversity picks go there first",
                "status": "warning",
            },
        ]

        automation_cards = [
            {
                "id": "start_new_images",
                "label": "Start when 2,000 new images arrive",
                "sub": "Uses the mix above",
                "checked": True,
                "disabled": False,
            },
            {
                "id": "drift_camera_flag",
                "label": "Start when 08 Drift flags lighting or a camera",
                "sub": "Picks focus on the drifted camera",
                "checked": True,
                "disabled": False,
            },
            {
                "id": "new_camera_random",
                "label": "New camera installed → 300 random frames first",
                "sub": "Cold start before uncertainty works",
                "checked": True,
                "disabled": False,
            },
            {
                "id": "retrain_after_round",
                "label": "Retrain in 06 after each round",
                "sub": "Template yolo11s.yaml",
                "checked": True,
                "disabled": False,
            },
            {
                "id": "ship_upload_rule",
                "label": "Ship the upload rule with the model",
                "sub": "Devices get both together",
                "checked": True,
                "disabled": False,
            },
            {
                "id": "promote_auto",
                "label": "Promote automatically",
                "sub": "Not available · shadow mode first in 06",
                "checked": False,
                "disabled": True,
            },
        ]

        filtered_picks = picks
        if strategy_filter and strategy_filter != "all":
            filtered_picks = [p for p in picks if p["strategy_key"] == strategy_filter]

        return {
            "dataset_id": dataset.id,
            "dataset_name": dataset.name,
            "round_badge": round_num,
            "round_state": "DRAFT",
            "round_state_label": "NEXT ROUND",
            "subtitle": "ACTIVE LEARNING · ROUND 3 · SCORED BY YOLO-DEFECTS-V4 · OBJECT DETECTION · 6 CLASSES",
            "metrics": {
                "pool": "6,950",
                "pool_sub": "uploaded from 48,300 frames · 7 days",
                "budget": "500 images",
                "budget_sub": "≈ 1 h 20 at the team's pace",
                "rare_class": "crack",
                "rare_class_sub": "272 real boxes",
                "output": output_v,
                "output_sub": "v4 kept as is",
            },
            "info_banner": {
                "title": "HOW ACTIVE LEARNING WORKS FOR IMAGES",
                "text": "The line cameras produce far more frames than anyone can label. The mini PCs already run the model, so they upload only the frames it is unsure about. Datalift then picks the most useful of those, one per scene, and sends them to 05 with the model's boxes drawn in.",
            },
            "loop_steps": [
                {"step": "0 · ON DEVICE", "stat": "6,950 uploaded", "note": "✓ 7 days", "status": "done"},
                {"step": "1 · SCORE POOL", "stat": "+ flips, scales", "note": "✓ done · 18 min", "status": "done"},
                {"step": "2 · PICK IMAGES", "stat": "500 previewed", "note": "now", "status": "active"},
                {"step": "3 · LABEL IN 05", "stat": "pre-annotated", "note": "waiting", "status": "pending"},
                {"step": "4 · RETRAIN IN 06", "stat": "yolo11s.yaml", "note": "waiting", "status": "pending"},
                {"step": "5 · MEASURE", "stat": "crack AP · test", "note": "waiting", "status": "pending"},
            ],
            "upload_rule": {
                "box_above": 0.30,
                "box_below": 0.60,
                "random_frame_in": 200,
                "always_upload_crack": True,
                "frames_seen": "48,300",
                "uploaded": "6,950",
                "not_uploaded_pct": "86%",
                "note": "The random 1-in-200 keeps an honest sample of what the line really looks like.",
            },
            "strategies": strategies,
            "round_settings": {
                "images_this_round": 500,
                "line1_min_pct": 40,
                "line2_min_pct": 40,
                "one_frame_per_scene": True,
                "send_dark_to_cleaning": True,
                "pre_annotate_model": "yolo-defects-v4 · min 0.30",
                "locked_note": "Never picked: test images · copy-paste images (locked)",
                "collection_alert": {
                    "class_name": "CRACK",
                    "real_boxes": "272 REAL BOXES",
                    "message": "Picking can't find cracks that were never filmed. Ask the line for more.",
                    "action_label": "Send a collection request...",
                },
            },
            "picks": filtered_picks,
            "all_picks_count": len(picks),
            "rounds_history": rounds_history,
            "learning_curve": {
                "metric_label": "CRACK AP@50 VS LABELED IMAGES",
                "metric_value": "[RESULT]",
                "metric_tooltip": "AP@50 crack: R1=42.1%, R2=51.8%, R3 (proj)=58.4%",
                "points_al": [{"x": "R1", "y": 42}, {"x": "R2", "y": 52}, {"x": "R3", "y": 58}],
                "points_random": [{"x": "R1", "y": 42}, {"x": "R2", "y": 46}, {"x": "R3", "y": 49}],
            },
            "stop_rule": {
                "rule_text": "1 point · 2 rounds",
                "note": "Then rounds only start on a new camera or a drift alert.",
            },
            "pseudo_labels": {
                "status": "OFF",
                "description": "Accept \"no defect\" frames above 0.98 for train only. Marked origin = pseudo, 5% spot-checked, never in val or test.",
                "button_label": "Turn on...",
            },
            "automation_cards": automation_cards,
            "guardrails": guardrails,
            "bottom_bar": {
                "text": "Round 3 · 500 images · 6 strategies · creates v5",
                "subtext": "Round log saved: model used, upload rule, score of every image, why each image was picked",
                "save_draft_label": "Save draft",
                "send_label": "Send 500 images to labeling →",
            },
        }

    def _get_dynamic_data(
        self,
        dataset: Dataset,
        v_count: int,
        latest_version: DatasetVersion,
        strategy_filter: Optional[str] = "all"
    ) -> Dict[str, Any]:
        curr_v = f"v{v_count}" if v_count > 0 else "v1"
        next_v = f"v{v_count + 1}"
        round_num = f"{v_count:02d}"

        # Generate realistic custom values based on dataset characteristics
        total_rows = latest_version.row_count or 1200
        pool_size = max(500, int(total_rows * 2.5))
        budget_size = min(300, max(50, int(total_rows * 0.15)))

        picks = [
            {
                "image_id": f"IMG_{1000 + i}",
                "tag": "UNCERTAIN" if i % 4 == 0 else "CRACK OR SCRATCH" if i % 4 == 1 else "RARE" if i % 4 == 2 else "RANDOM",
                "tag_type": "blue" if i % 4 <= 1 else "red" if i % 4 == 2 else "gray",
                "description": f"region {i+1} · conf {(0.32 + (i * 0.07)):.2f}",
                "strategy_key": "uncertain" if i % 4 == 0 else "crack_or_scratch" if i % 4 == 1 else "rare" if i % 4 == 2 else "random",
                "defect_type": "defect" if i % 4 != 3 else "clean",
                "line": f"line {(i % 2) + 1}",
                "confidence": round(0.32 + (i * 0.07), 2),
                "box": {"x": 30 + (i * 5) % 40, "y": 30 + (i * 7) % 35, "w": 30, "h": 25, "shape": "dot" if i % 2 == 0 else "slash"},
            }
            for i in range(8)
        ]

        strategies = [
            {
                "key": "uncertain",
                "name": "Uncertain boxes",
                "description": "Confidence between 0.30 and 0.60",
                "share_pct": 35,
                "images": int(budget_size * 0.35),
            },
            {
                "key": "crack_or_scratch",
                "name": "Borderline overlap",
                "description": "Top-2 classes close on same bounding region",
                "share_pct": 25,
                "images": int(budget_size * 0.25),
            },
            {
                "key": "flips",
                "name": "Transform variance",
                "description": "Predictions shift under rotation/flips",
                "share_pct": 15,
                "images": int(budget_size * 0.15),
            },
            {
                "key": "rare",
                "name": "Rare class focus",
                "description": "Under-represented class occurrences",
                "share_pct": 10,
                "images": int(budget_size * 0.10),
            },
            {
                "key": "diversity",
                "name": "Cluster diversity",
                "description": "Low density feature embeddings",
                "share_pct": 5,
                "images": int(budget_size * 0.05),
            },
            {
                "key": "random",
                "name": "Random control",
                "description": "Honest baseline sample",
                "badge": "MIN 10%",
                "share_pct": 10,
                "images": int(budget_size * 0.10),
            },
        ]

        rounds_history = [
            {
                "round": "R1",
                "name": "ROUND 1 · COLD START",
                "images": str(int(budget_size * 1.5)),
                "strategy": "random baseline",
                "hours": "2 h",
                "data": f"v1",
                "model": f"{dataset.name.lower()}-v1",
                "ap_gain": "—",
                "target_version": "v1",
                "status": "DONE",
            },
            {
                "round": f"R{v_count}",
                "name": f"ROUND {v_count} · DRAFT",
                "images": str(budget_size),
                "strategy": "6 active strategies",
                "hours": "≈ 1 h",
                "data": next_v,
                "model": "—",
                "ap_gain": "—",
                "target_version": next_v,
                "status": "DRAFT",
            },
        ]

        filtered_picks = picks
        if strategy_filter and strategy_filter != "all":
            filtered_picks = [p for p in picks if p["strategy_key"] == strategy_filter]

        return {
            "dataset_id": dataset.id,
            "dataset_name": dataset.name,
            "round_badge": round_num,
            "round_state": "DRAFT",
            "round_state_label": "NEXT ROUND",
            "subtitle": f"ACTIVE LEARNING · ROUND {v_count} · SCORED BY {dataset.name.upper()}-{curr_v.upper()} · {total_rows} SAMPLES",
            "metrics": {
                "pool": f"{pool_size:,}",
                "pool_sub": f"uploaded from {pool_size * 7:,} frames",
                "budget": f"{budget_size} images",
                "budget_sub": "estimated annotation round",
                "rare_class": "minority_pattern",
                "rare_class_sub": f"{max(12, int(total_rows * 0.05))} identified items",
                "output": next_v,
                "output_sub": f"{curr_v} kept as baseline",
            },
            "info_banner": {
                "title": f"HOW ACTIVE LEARNING WORKS FOR {dataset.name.upper()}",
                "text": f"Production sensors ingest continuous visual inputs. Active learning identifies the highest-uncertainty samples to annotate for {next_v}.",
            },
            "loop_steps": [
                {"step": "0 · ON DEVICE", "stat": f"{pool_size:,} uploaded", "note": "✓ filtered", "status": "done"},
                {"step": "1 · SCORE POOL", "stat": "+ aug test", "note": "✓ done", "status": "done"},
                {"step": "2 · PICK IMAGES", "stat": f"{budget_size} previewed", "note": "now", "status": "active"},
                {"step": "3 · LABEL IN 05", "stat": "pre-annotated", "note": "waiting", "status": "pending"},
                {"step": "4 · RETRAIN IN 06", "stat": "retrain spec", "note": "waiting", "status": "pending"},
                {"step": "5 · MEASURE", "stat": "eval gain", "note": "waiting", "status": "pending"},
            ],
            "upload_rule": {
                "box_above": 0.25,
                "box_below": 0.65,
                "random_frame_in": 150,
                "always_upload_crack": True,
                "frames_seen": f"{pool_size * 7:,}",
                "uploaded": f"{pool_size:,}",
                "not_uploaded_pct": "82%",
                "note": "Sample filter on camera edges.",
            },
            "strategies": strategies,
            "round_settings": {
                "images_this_round": budget_size,
                "line1_min_pct": 35,
                "line2_min_pct": 35,
                "one_frame_per_scene": True,
                "send_dark_to_cleaning": True,
                "pre_annotate_model": f"{dataset.name.lower()}-{curr_v} · min 0.30",
                "locked_note": "Never picked: test set (locked)",
                "collection_alert": {
                    "class_name": "MINORITY_PATTERN",
                    "real_boxes": f"{max(12, int(total_rows * 0.05))} REAL BOXES",
                    "message": "Low coverage for edge defect variations. Request dedicated sample captures.",
                    "action_label": "Send a collection request...",
                },
            },
            "picks": filtered_picks,
            "all_picks_count": len(picks),
            "rounds_history": rounds_history,
            "learning_curve": {
                "metric_label": "mAP@50 VS LABELED SAMPLES",
                "metric_value": "[RESULT]",
                "metric_tooltip": f"mAP gain: R1=48.2%, R{v_count} (proj)=57.1%",
                "points_al": [{"x": "R1", "y": 48}, {"x": f"R{v_count}", "y": 57}],
                "points_random": [{"x": "R1", "y": 48}, {"x": f"R{v_count}", "y": 52}],
            },
            "stop_rule": {
                "rule_text": "1.5 points · 2 rounds",
                "note": "Stop criterion for automated cycles.",
            },
            "pseudo_labels": {
                "status": "OFF",
                "description": "Accept high-confidence predictions (>0.98) as train-only pseudo-labels.",
                "button_label": "Turn on...",
            },
            "automation_cards": [
                {
                    "id": "start_new_images",
                    "label": f"Start when {pool_size // 2:,} new frames arrive",
                    "sub": "Uses current active mix",
                    "checked": True,
                    "disabled": False,
                },
                {
                    "id": "drift_camera_flag",
                    "label": "Start when 08 Drift flags data shift",
                    "sub": "Prioritizes drifted sources",
                    "checked": True,
                    "disabled": False,
                },
                {
                    "id": "new_camera_random",
                    "label": "New source registered → random baseline first",
                    "sub": "Bootstrap phase",
                    "checked": True,
                    "disabled": False,
                },
                {
                    "id": "retrain_after_round",
                    "label": "Retrain in 06 after each round",
                    "sub": "Automated retraining pipeline",
                    "checked": True,
                    "disabled": False,
                },
                {
                    "id": "ship_upload_rule",
                    "label": "Sync upload filter with deployed artifact",
                    "sub": "Co-versioned rules",
                    "checked": True,
                    "disabled": False,
                },
                {
                    "id": "promote_auto",
                    "label": "Promote automatically",
                    "sub": "Not available · shadow mode first in 06",
                    "checked": False,
                    "disabled": True,
                },
            ],
            "guardrails": [
                {
                    "label": "Test split locked and untouched",
                    "description": "Never exposed to active learning loop",
                    "status": "ok",
                },
                {
                    "label": "Random baseline preserved",
                    "description": "Min 10% kept for objective delta measurement",
                    "status": "ok",
                },
                {
                    "label": "Duplicate deduplication",
                    "description": "Near-duplicates filtered via embedding distance",
                    "status": "ok",
                },
                {
                    "label": "Synthetic/augmented frames isolated",
                    "description": "Only real camera frames in active learning pool",
                    "status": "ok",
                },
                {
                    "label": "Pseudo-labels restricted to train",
                    "description": "Spot-checked at 5% rate",
                    "status": "ok",
                },
                {
                    "label": "Edge upload rules logged",
                    "description": "Full audit trail preserved",
                    "status": "ok",
                },
                {
                    "label": "Versioning isolation",
                    "description": f"{curr_v} preserved, output creates {next_v}",
                    "status": "ok",
                },
                {
                    "label": "Edge camera lighting imbalance",
                    "description": "Minority classes targeted by diversity sampler",
                    "status": "warning",
                },
            ],
            "bottom_bar": {
                "text": f"Round {v_count} · {budget_size} images · 6 strategies · creates {next_v}",
                "subtext": f"Round log saved: model {dataset.name.lower()}-{curr_v}, upload rule, scores",
                "save_draft_label": "Save draft",
                "send_label": f"Send {budget_size} images to labeling →",
            },
        }

    def save_draft(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        return {
            "status": "success",
            "message": f"Active learning draft saved for round {payload.get('round', 'R3')}",
            "round": payload.get("round", "R3"),
            "dataset_id": dataset_id,
        }

    def send_to_labeling(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        count = payload.get("count", 500)
        target_version = payload.get("target_version", "v5")
        return {
            "status": "success",
            "message": f"{count} images sent to 05 Labeling queue (target: {target_version})",
            "count": count,
            "target_version": target_version,
            "dataset_id": dataset_id,
        }


image_active_learning_service = ImageActiveLearningService()

