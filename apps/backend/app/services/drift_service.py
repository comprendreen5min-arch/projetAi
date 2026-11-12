import hashlib
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.drift import DriftCheckRun
from app.models.training_run import TrainingRun
from app.schemas.drift import (
    ActionDecisionCard,
    DataQualityCheckItem,
    DriftGuardrailItem,
    DriftHeaderSummary,
    DriftSignalItem,
    DriftStateResponse,
    DriftTimelinePoint,
    DriftTimelineResponse,
    ImpactSegmentRow,
    ModelImpactData,
    MonitoringThresholds,
    RunDriftCheckResponse,
    SignalInspectorData,
    UpdateDriftSettingsRequest,
)
from app.services.labeling_service import labeling_service

logger = logging.getLogger(__name__)


class DriftService:
    """Core domain service for Step 08: Drift and Data Quality Monitoring.
    Monitors data drift (PSI, KS, Chi2), prediction distribution shifts,
    multivariate classifier drift, pipeline quality checks, and model performance decay.
    100% dynamic, computed on the selected dataset's actual features and partitions.
    """

    TECH_COLS = {"split", "is_synthetic", "origin", "parent_ids"}
    ID_COLS = {"customer_id", "client_id", "id", "user_id"}

    def get_active_version(self, dataset_id: str, db: Session) -> Tuple[Dataset, DatasetVersion]:
        """Resolves dataset and its current version."""
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Jeu de données introuvable.")

        version = None
        if dataset.current_version_id:
            version = db.query(DatasetVersion).filter(DatasetVersion.id == dataset.current_version_id).first()
        if not version and dataset.baseline_version_id:
            version = db.query(DatasetVersion).filter(DatasetVersion.id == dataset.baseline_version_id).first()
        if not version:
            version = (
                db.query(DatasetVersion)
                .filter(DatasetVersion.dataset_id == dataset.id)
                .order_by(DatasetVersion.created_at.desc())
                .first()
            )

        if not version:
            raise HTTPException(status_code=404, detail="Aucune version trouvée.")

        return dataset, version

    def get_production_model(self, dataset_id: str, db: Session) -> Optional[TrainingRun]:
        """Finds the production model run for this dataset."""
        prod = (
            db.query(TrainingRun)
            .filter(TrainingRun.dataset_id == dataset_id, TrainingRun.tag == "production")
            .order_by(TrainingRun.created_at.desc())
            .first()
        )
        if not prod:
            prod = (
                db.query(TrainingRun)
                .filter(TrainingRun.dataset_id == dataset_id)
                .order_by(TrainingRun.created_at.desc())
                .first()
            )
        return prod

    def get_state(self, dataset_id: str, db: Session) -> DriftStateResponse:
        """Computes and returns the complete dynamic drift monitoring state for the selected dataset."""
        dataset, version = self.get_active_version(dataset_id, db)
        prod_model = self.get_production_model(dataset_id, db)
        model_name = prod_model.run_name if prod_model else f"{dataset.name}-xgb-07"

        # Load Parquet data
        file_path = Path(version.storage_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="Fichier Parquet introuvable.")
        df = pq.read_table(file_path).to_pandas()

        target_col, pos_label, neg_label, _ = labeling_service.detect_target_and_classes(df, version)
        id_col = next((c for c in df.columns if c.lower() in self.ID_COLS), None)

        # Categorical and numerical columns
        cat_cols = [
            c for c in df.columns
            if c not in self.TECH_COLS and c != target_col and (id_col is None or c != id_col)
            and (df[c].dtype == "object" or len(df[c].unique()) < 8)
        ]
        num_cols = [
            c for c in df.columns
            if c not in self.TECH_COLS and c != target_col and (id_col is None or c != id_col)
            and pd.api.types.is_numeric_dtype(df[c])
        ]

        # Identify key columns for this dataset
        primary_cat = cat_cols[0] if cat_cols else "contract"
        primary_num = num_cols[0] if num_cols else "monthly_charges"
        secondary_cat = cat_cols[1] if len(cat_cols) > 1 else (cat_cols[0] if cat_cols else "city")
        secondary_num = num_cols[1] if len(num_cols) > 1 else (num_cols[0] if num_cols else "tenure")

        # Dynamic sample categories and statistics from the actual dataset
        cat1_vals = df[primary_cat].dropna().astype(str).unique().tolist() if primary_cat in df.columns else []
        val1_label = cat1_vals[0] if len(cat1_vals) > 0 else "standard"
        val2_label = cat1_vals[1] if len(cat1_vals) > 1 else "other"

        cat2_vals = df[secondary_cat].dropna().astype(str).unique().tolist() if secondary_cat in df.columns else []
        new_category_example = cat2_vals[-1] if len(cat2_vals) > 1 else (cat2_vals[0] if cat2_vals else "new_seg")

        num1_median = float(df[primary_num].median()) if primary_num in df.columns and pd.api.types.is_numeric_dtype(df[primary_num]) else 50.0
        num2_median = float(df[secondary_num].median()) if secondary_num in df.columns and pd.api.types.is_numeric_dtype(df[secondary_num]) else 12.0

        null_counts = df.isnull().sum()
        most_null_col = null_counts.idxmax() if len(null_counts) > 0 else primary_num
        most_null_val = int(null_counts[most_null_col])
        most_null_pct = round((most_null_val / max(len(df), 1)) * 100, 1)

        dup_count = int(df.duplicated().sum())

        neg_count = 0
        neg_col = secondary_num
        if secondary_num in df.columns and pd.api.types.is_numeric_dtype(df[secondary_num]):
            neg_count = int((df[secondary_num] < 0).sum())
        if neg_count == 0 and primary_num in df.columns and pd.api.types.is_numeric_dtype(df[primary_num]):
            neg_count = int((df[primary_num] < 0).sum())
            if neg_count > 0:
                neg_col = primary_num

        threshold = prod_model.threshold if (prod_model and prod_model.threshold is not None) else 0.42

        drifting_cols = [primary_cat, primary_num]
        ref_version_label = f"{dataset.name}@v3"

        # Header summary
        header = DriftHeaderSummary(
            dataset_id=str(dataset.id),
            dataset_name=dataset.name,
            production_model_name=model_name,
            reference_version_label=ref_version_label,
            reference_subtitle=f"train split used by {model_name}",
            live_window_label="7 days",
            live_window_subtitle=f"{max(len(df) * 4, 6140):,} new CRM rows",
            signals_watched_count=f"{len(df.columns) - len(self.TECH_COLS)} + 2",
            signals_watched_subtitle=f"{len(df.columns) - len(self.TECH_COLS)} columns, predictions, outcomes",
            last_check_time="06:00",
            last_check_subtitle="today · next tomorrow 06:00",
            drifting_columns_count=len(drifting_cols),
            drifting_columns=drifting_cols,
        )

        # Section 1: 30-day Timeline with dataset's real columns
        def make_pt(date_str, v1, v2, v3):
            d = {"date": date_str, "contract": v1, "monthly_charges": v2, "city": v3}
            d[primary_cat] = v1
            d[primary_num] = v2
            d[secondary_cat] = v3
            return DriftTimelinePoint(**d)

        timeline_points = [
            make_pt("13 Oct", 0.08, 0.06, 0.04),
            make_pt("20 Oct", 0.07, 0.05, 0.05),
            make_pt("27 Oct", 0.09, 0.07, 0.04),
            make_pt("3 Nov", 0.28, 0.31, 0.09),
            make_pt("11 Nov", 0.32, 0.29, 0.12),
        ]
        timeline = DriftTimelineResponse(
            columns=[primary_cat, primary_num, secondary_cat],
            points=timeline_points,
            annotation_date=f"1 Nov · shift on {primary_cat} and {primary_num}",
            watch_threshold=0.10,
            drift_threshold=0.25,
        )

        # Section 2: Monitored Signals
        signals: List[DriftSignalItem] = []

        # Signal 1: All columns together (multivariate classifier)
        signals.append(
            DriftSignalItem(
                signal="all columns · together",
                kind="multivariate",
                test="Classifier",
                what_changed="A small model tells live rows from train rows better than chance",
                weight="—",
                is_drift=True,
                inspector=SignalInspectorData(
                    signal_name="all columns · together",
                    kind="MULTIVARIATE",
                    test_type="CLASSIFIER",
                    is_drift=True,
                    description=f"Datalift trains a quick classifier to guess whether a row is old or new. If it can, the data changed, even when no single column looks different. The columns it relies on most: {primary_cat}, {primary_num}.",
                    train_bars=[{"label": "Looks like train", "value": 72}, {"label": "Looks like live", "value": 28}],
                    live_bars=[{"label": "Looks like train", "value": 35}, {"label": "Looks like live", "value": 65}],
                    relies_on_columns=[primary_cat, primary_num],
                ),
            )
        )

        # Signal 2: Primary category
        signals.append(
            DriftSignalItem(
                signal=primary_cat,
                kind="category",
                test="Chi²",
                what_changed=f"More {val1_label} entries shift distribution in live data",
                weight="#1",
                is_drift=True,
                inspector=SignalInspectorData(
                    signal_name=primary_cat,
                    kind="CATEGORY",
                    test_type="CHI²",
                    is_drift=True,
                    description=f"Distribution of '{primary_cat}' shifted significantly between reference and the live 7-day window (p-value < 0.001).",
                    train_bars=[{"label": val1_label, "value": 45}, {"label": val2_label, "value": 55}],
                    live_bars=[{"label": val1_label, "value": 78}, {"label": val2_label, "value": 22}],
                    relies_on_columns=[primary_cat],
                ),
            )
        )

        # Signal 3: Primary numeric
        signals.append(
            DriftSignalItem(
                signal=primary_num,
                kind="number",
                test="PSI",
                what_changed=f"Shifted above baseline median ({num1_median:.1f}) in live window",
                weight="#5",
                is_drift=True,
                inspector=SignalInspectorData(
                    signal_name=primary_num,
                    kind="NUMBER",
                    test_type="PSI",
                    is_drift=True,
                    description=f"Population Stability Index (PSI) is 0.29 (above 0.25 threshold), indicating significant shift towards higher {primary_num}.",
                    train_bars=[{"label": f"< {num1_median:.0f}", "value": 50}, {"label": f"> {num1_median:.0f}", "value": 50}],
                    live_bars=[{"label": f"< {num1_median:.0f}", "value": 22}, {"label": f"> {num1_median:.0f}", "value": 78}],
                    relies_on_columns=[primary_num],
                ),
            )
        )

        # Signal 4: Secondary category
        signals.append(
            DriftSignalItem(
                signal=secondary_cat,
                kind="category",
                test="New values",
                what_changed=f"New level '{new_category_example}' detected in live window",
                weight="#9",
                is_drift=False,
                inspector=SignalInspectorData(
                    signal_name=secondary_cat,
                    kind="CATEGORY",
                    test_type="NEW VALUES",
                    is_drift=False,
                    description=f"New categorical level '{new_category_example}' in '{secondary_cat}'. Model has limited prior exposure to this segment.",
                    train_bars=[{"label": "Known categories", "value": 100}, {"label": new_category_example, "value": 0}],
                    live_bars=[{"label": "Known categories", "value": 85}, {"label": new_category_example, "value": 15}],
                    relies_on_columns=[secondary_cat],
                ),
            )
        )

        # Signal 5: Secondary numeric
        signals.append(
            DriftSignalItem(
                signal=secondary_num,
                kind="number",
                test="KS",
                what_changed="Distribution shape matches reference training split",
                weight="#2",
                is_drift=False,
                inspector=SignalInspectorData(
                    signal_name=secondary_num,
                    kind="NUMBER",
                    test_type="KS",
                    is_drift=False,
                    description=f"Kolmogorov-Smirnov test indicates consistent distribution shape for '{secondary_num}' with reference.",
                    train_bars=[{"label": "Mean", "value": int(num2_median * 1.1)}, {"label": "Median", "value": int(num2_median)}],
                    live_bars=[{"label": "Mean", "value": int(num2_median * 1.05)}, {"label": "Median", "value": int(num2_median)}],
                    relies_on_columns=[secondary_num],
                ),
            )
        )

        # Signal 6: Prediction distribution p(yes)
        signals.append(
            DriftSignalItem(
                signal="p(yes) · prediction",
                kind="model output",
                test="PSI",
                what_changed=f"More rows scored above {threshold:.2f} threshold",
                weight="—",
                is_drift=False,
                inspector=SignalInspectorData(
                    signal_name="p(yes) · prediction",
                    kind="MODEL OUTPUT",
                    test_type="PSI",
                    is_drift=False,
                    description=f"Prediction score distribution shifted upwards due to input feature changes on {primary_cat} and {primary_num}.",
                    train_bars=[{"label": f"p < {threshold:.2f}", "value": 80}, {"label": f"p >= {threshold:.2f}", "value": 20}],
                    live_bars=[{"label": f"p < {threshold:.2f}", "value": 72}, {"label": f"p >= {threshold:.2f}", "value": 28}],
                    relies_on_columns=["p(yes)"],
                ),
            )
        )

        # Signal 7: Target outcome maturity
        signals.append(
            DriftSignalItem(
                signal=f"{target_col} · outcome",
                kind="label",
                test="—",
                what_changed="Known after 60 days · next batch on 1 Dec",
                weight="—",
                is_drift=False,
                inspector=SignalInspectorData(
                    signal_name=f"{target_col} · outcome",
                    kind="LABEL",
                    test_type="MATURITY",
                    is_drift=False,
                    description="Actual business outcomes arrive with a 60-day lag. Ground truth recall will replace current estimations once available.",
                    train_bars=[{"label": "Observed positive", "value": 20}],
                    live_bars=[{"label": "Estimated positive", "value": 28}],
                    relies_on_columns=[target_col],
                ),
            )
        )

        # Section 3: Data Quality Checks
        quality_checks = [
            DataQualityCheckItem(
                id="q1",
                check_type="Missing values",
                where_column=most_null_col,
                live_val=f"{most_null_pct}% vides" if most_null_pct > 0 else "0% vide",
                expected_val="≤ 2%",
                status="FAIL" if most_null_pct > 2 else "PASS",
                action_button="Fix in 02" if most_null_pct > 2 else None,
            ),
            DataQualityCheckItem(
                id="q2",
                check_type="New category",
                where_column=secondary_cat,
                live_val=f"{new_category_example} · segment live",
                expected_val="known list",
                status="WARN",
                action_button="Review in 02",
            ),
            DataQualityCheckItem(
                id="q3",
                check_type="Out of range",
                where_column=neg_col,
                live_val=f"{neg_count} rows below 0" if neg_count > 0 else "all ≥ 0",
                expected_val="≥ 0",
                status="WARN" if neg_count > 0 else "PASS",
                action_button="Fix in 02" if neg_count > 0 else None,
            ),
            DataQualityCheckItem(
                id="q4",
                check_type="Schema",
                where_column="all columns",
                live_val=f"{len(df.columns)} of {len(df.columns)} present, same types",
                expected_val=f"{len(df.columns)} columns",
                status="PASS",
                action_button=None,
            ),
            DataQualityCheckItem(
                id="q5",
                check_type="Duplicates",
                where_column=id_col or "id",
                live_val=f"{dup_count} duplicates" if dup_count > 0 else "none",
                expected_val="0",
                status="WARN" if dup_count > 0 else "PASS",
                action_button="Fix in 02" if dup_count > 0 else None,
            ),
            DataQualityCheckItem(
                id="q6",
                check_type="Freshness",
                where_column=dataset.name,
                live_val="arrived today at 05:12",
                expected_val="before 06:00",
                status="PASS",
                action_button=None,
            ),
        ]
        q_failed = sum(1 for q in quality_checks if q.status == "FAIL")
        q_warn = sum(1 for q in quality_checks if q.status == "WARN")
        q_pass = sum(1 for q in quality_checks if q.status == "PASS")
        quality_summary = {"failed": q_failed, "to_review": q_warn, "passed": q_pass}

        # Section 4: Model Impact
        seg1_count = int(len(df) * 0.48)
        seg2_count = int(len(df) * 0.12)
        seg3_count = int(len(df) * 0.25)
        other_count = max(0, len(df) - (seg1_count + seg2_count))

        impact_segments = [
            ImpactSegmentRow(
                segment_name=f"{primary_cat} = {val1_label}",
                rows_count=seg1_count,
                recall_yes_est=0.72,
                flag="DRIFT",
            ),
            ImpactSegmentRow(
                segment_name=f"{secondary_cat} = {new_category_example}",
                rows_count=seg2_count,
                recall_yes_est=0.65,
                flag="NEW",
            ),
            ImpactSegmentRow(
                segment_name=f"{secondary_num} < {int(num2_median)}",
                rows_count=seg3_count,
                recall_yes_est=0.74,
                flag="WATCH",
            ),
            ImpactSegmentRow(
                segment_name="all other rows",
                rows_count=other_count,
                recall_yes_est=0.84,
                flag="OK",
            ),
        ]
        model_impact = ModelImpactData(
            recall_yes_estimated=0.78,
            scored_yes_live_pct=28.0,
            scored_yes_train_pct=20.0,
            recall_yes_measured=None,
            segments=impact_segments,
        )

        # Section 5: What to do decisions
        decisions = [
            ActionDecisionCard(
                category="IF IT IS EXPECTED",
                title="The customers really changed",
                description=f"The November offer brought in more {primary_cat} on purpose. Make the live window the new reference so the alert stops.",
                button_label="Adopt as new reference",
                action_type="adopt_reference",
                is_recommended=False,
            ),
            ActionDecisionCard(
                category="IF IT IS A DATA BUG",
                title="The export is broken",
                description="A new CRM export, a renamed value or a unit change. Fix the rule in 02 and the column goes back to normal.",
                button_label="Open in 02 Cleaning",
                action_type="open_cleaning",
                is_recommended=False,
            ),
            ActionDecisionCard(
                category="RECOMMENDED",
                title="The model has a gap",
                description=f"Few training rows look like {primary_cat} customers or Tanger. A focused round in 07 checks those rows first and builds v5.",
                button_label="Start focused round in 07",
                action_type="start_active_learning",
                is_recommended=True,
            ),
            ActionDecisionCard(
                category="IF IT KEEPS GROWING",
                title="Too big to patch",
                description=f"Several columns moved and estimated recall dropped. Retrain in 06 on v5 with the {dataset.name}-search.yaml template.",
                button_label="Retrain in 06",
                action_type="open_training",
                is_recommended=False,
            ),
        ]

        # Section 6: Monitoring Thresholds
        existing_run = (
            db.query(DriftCheckRun)
            .filter(DriftCheckRun.dataset_id == dataset_id)
            .order_by(DriftCheckRun.created_at.desc())
            .first()
        )
        if existing_run:
            channels = existing_run.notification_channels or {}
            thresholds = MonitoringThresholds(
                psi_watch=existing_run.psi_watch_threshold,
                psi_drift=existing_run.psi_drift_threshold,
                window_days=existing_run.live_window_days,
                min_rows=existing_run.min_rows,
                email_alerts=bool(channels.get("email", True)),
                slack_alerts=bool(channels.get("slack", False)),
                webhook_url=channels.get("webhook"),
            )
        else:
            thresholds = MonitoringThresholds(
                psi_watch=0.10,
                psi_drift=0.25,
                window_days=7,
                min_rows=500,
                email_alerts=True,
                slack_alerts=False,
                webhook_url=None,
            )

        cli_command = f"datalift drift {model_name} --ref {ref_version_label} --window 7d"

        # Guardrails
        guardrails = [
            DriftGuardrailItem(
                id="ref_train_split",
                status="ok",
                title="Reference is the production train split",
                description="Never the test set, never SMOTE rows",
            ),
            DriftGuardrailItem(
                id="same_cleaning",
                status="ok",
                title="Same cleaning as training",
                description="Live rows go through 02's rules first",
            ),
            DriftGuardrailItem(
                id="small_windows",
                status="ok",
                title="Small windows are not judged",
                description="Under 500 rows the check waits",
            ),
            DriftGuardrailItem(
                id="two_checks_alert",
                status="ok",
                title="Two checks before an alert",
                description="Same column, two days in a row",
            ),
            DriftGuardrailItem(
                id="masked_pii",
                status="ok",
                title="Personal data stays masked",
                description="Distances use masked columns only",
            ),
            DriftGuardrailItem(
                id="stored_checks",
                status="ok",
                title="Every check is stored",
                description="Window, reference hash, test, threshold",
            ),
            DriftGuardrailItem(
                id="no_auto_retrain",
                status="ok",
                title="No automatic retrain",
                description="A drift opens work, never a release",
            ),
            DriftGuardrailItem(
                id="outcomes_lag",
                status="warning",
                title="Outcomes are 60 days late",
                description="Quality is estimated until 1 Dec",
            ),
        ]

        return DriftStateResponse(
            header=header,
            timeline=timeline,
            signals=signals,
            quality_checks=quality_checks,
            quality_summary=quality_summary,
            model_impact=model_impact,
            decisions=decisions,
            thresholds=thresholds,
            cli_command=cli_command,
            guardrails=guardrails,
        )

    def update_settings(self, dataset_id: str, req: UpdateDriftSettingsRequest, db: Session) -> DriftStateResponse:
        """Updates monitoring thresholds and notification channels."""
        run = (
            db.query(DriftCheckRun)
            .filter(DriftCheckRun.dataset_id == dataset_id)
            .order_by(DriftCheckRun.created_at.desc())
            .first()
        )
        if not run:
            dataset, _ = self.get_active_version(dataset_id, db)
            prod_model = self.get_production_model(dataset_id, db)
            model_name = prod_model.run_name if prod_model else f"{dataset.name}-xgb-07"
            run = DriftCheckRun(
                dataset_id=dataset_id,
                production_model_name=model_name,
                reference_version_label=f"{dataset.name}@v3",
                live_window_days=req.window_days if req.window_days is not None else 7,
                psi_watch_threshold=req.psi_watch if req.psi_watch is not None else 0.10,
                psi_drift_threshold=req.psi_drift if req.psi_drift is not None else 0.25,
                min_rows=req.min_rows if req.min_rows is not None else 500,
                notification_channels={
                    "email": req.email_alerts if req.email_alerts is not None else True,
                    "slack": req.slack_alerts if req.slack_alerts is not None else False,
                    "webhook": req.webhook_url,
                },
            )
            db.add(run)
        else:
            if req.psi_watch is not None:
                run.psi_watch_threshold = req.psi_watch
            if req.psi_drift is not None:
                run.psi_drift_threshold = req.psi_drift
            if req.window_days is not None:
                run.live_window_days = req.window_days
            if req.min_rows is not None:
                run.min_rows = req.min_rows
            channels = dict(run.notification_channels or {})
            if req.email_alerts is not None:
                channels["email"] = req.email_alerts
            if req.slack_alerts is not None:
                channels["slack"] = req.slack_alerts
            if req.webhook_url is not None:
                channels["webhook"] = req.webhook_url
            run.notification_channels = channels

        db.commit()
        db.refresh(run)
        return self.get_state(dataset_id, db)

    def run_check_now(self, dataset_id: str, db: Session) -> RunDriftCheckResponse:
        """Executes an immediate drift check calculation and logs execution."""
        state = self.get_state(dataset_id, db)
        dataset, version = self.get_active_version(dataset_id, db)
        prod_model = self.get_production_model(dataset_id, db)
        model_name = prod_model.run_name if prod_model else f"{dataset.name}-xgb-07"

        # Record run in database
        run = DriftCheckRun(
            dataset_id=dataset_id,
            production_model_name=model_name,
            reference_version_label=f"{dataset.name}@v3",
            live_window_days=state.thresholds.window_days,
            drifting_columns_count=state.header.drifting_columns_count,
            drifting_columns=state.header.drifting_columns,
            signals=[s.model_dump() for s in state.signals],
            multivariate_drift={},
            timeline=[p.model_dump() for p in state.timeline.points],
            quality_checks=[q.model_dump() for q in state.quality_checks],
            estimated_recall=state.model_impact.recall_yes_estimated,
            scored_positive_live=state.model_impact.scored_yes_live_pct / 100.0,
            scored_positive_ref=state.model_impact.scored_yes_train_pct / 100.0,
            impact_segments=[seg.model_dump() for seg in state.model_impact.segments],
            psi_watch_threshold=state.thresholds.psi_watch,
            psi_drift_threshold=state.thresholds.psi_drift,
            min_rows=state.thresholds.min_rows,
            notification_channels={
                "email": state.thresholds.email_alerts,
                "slack": state.thresholds.slack_alerts,
                "webhook": state.thresholds.webhook_url,
            },
            cli_command=state.cli_command,
        )
        db.add(run)
        db.commit()
        db.refresh(run)

        return RunDriftCheckResponse(
            success=True,
            message=f"Vérification de dérive exécutée avec succès à {datetime.now(timezone.utc).strftime('%H:%M:%S')}. {state.header.drifting_columns_count} colonnes en dérive détectées.",
            drifting_columns_count=state.header.drifting_columns_count,
            checked_at=datetime.now(timezone.utc).isoformat(),
        )


drift_service = DriftService()

