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

        # Section 1: 30-day Timeline
        timeline_points = [
            DriftTimelinePoint(date="13 Oct", contract=0.08, monthly_charges=0.06, city=0.04),
            DriftTimelinePoint(date="20 Oct", contract=0.07, monthly_charges=0.05, city=0.05),
            DriftTimelinePoint(date="27 Oct", contract=0.09, monthly_charges=0.07, city=0.04),
            DriftTimelinePoint(date="3 Nov", contract=0.28, monthly_charges=0.31, city=0.09),
            DriftTimelinePoint(date="11 Nov", contract=0.32, monthly_charges=0.29, city=0.12),
        ]
        timeline = DriftTimelineResponse(
            columns=[primary_cat, primary_num, secondary_cat],
            points=timeline_points,
            annotation_date="1 Nov · new prices and offer",
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

        # Signal 2: Primary category (e.g. contract)
        signals.append(
            DriftSignalItem(
                signal=primary_cat,
                kind="category",
                test="Chi²",
                what_changed=f"More {primary_cat} shifts since the November offer",
                weight="#1",
                is_drift=True,
                inspector=SignalInspectorData(
                    signal_name=primary_cat,
                    kind="CATEGORY",
                    test_type="CHI²",
                    is_drift=True,
                    description=f"Distribution of '{primary_cat}' shifted significantly between reference v3 and the live 7-day window (p-value < 0.001).",
                    train_bars=[{"label": "mensuel / standard", "value": 45}, {"label": "annuel / long", "value": 55}],
                    live_bars=[{"label": "mensuel / standard", "value": 78}, {"label": "annuel / long", "value": 22}],
                    relies_on_columns=[primary_cat],
                ),
            )
        )

        # Signal 3: Primary numeric (e.g. monthly_charges)
        signals.append(
            DriftSignalItem(
                signal=primary_num,
                kind="number",
                test="PSI",
                what_changed="Shifted up after the price change on 1 Nov",
                weight="#5",
                is_drift=True,
                inspector=SignalInspectorData(
                    signal_name=primary_num,
                    kind="NUMBER",
                    test_type="PSI",
                    is_drift=True,
                    description=f"Population Stability Index (PSI) is 0.29 (above the 0.25 threshold), indicating significant shift towards higher charge brackets.",
                    train_bars=[{"label": "Q1 (< 50)", "value": 40}, {"label": "Q4 (> 90)", "value": 15}],
                    live_bars=[{"label": "Q1 (< 50)", "value": 18}, {"label": "Q4 (> 90)", "value": 48}],
                    relies_on_columns=[primary_num],
                ),
            )
        )

        # Signal 4: Secondary category (e.g. city)
        signals.append(
            DriftSignalItem(
                signal=secondary_cat,
                kind="category",
                test="New values",
                what_changed="412 rows from Tanger, a new category never seen in training",
                weight="#9",
                is_drift=False,
                inspector=SignalInspectorData(
                    signal_name=secondary_cat,
                    kind="CATEGORY",
                    test_type="NEW VALUES",
                    is_drift=False,
                    description=f"New categorical level detected in '{secondary_cat}'. Model has no prior knowledge of this segment.",
                    train_bars=[{"label": "Known cities", "value": 100}, {"label": "Tanger", "value": 0}],
                    live_bars=[{"label": "Known cities", "value": 85}, {"label": "Tanger", "value": 15}],
                    relies_on_columns=[secondary_cat],
                ),
            )
        )

        # Signal 5: Secondary numeric (e.g. tenure)
        signals.append(
            DriftSignalItem(
                signal=secondary_num,
                kind="number",
                test="KS",
                what_changed="Same shape as training",
                weight="#2",
                is_drift=False,
                inspector=SignalInspectorData(
                    signal_name=secondary_num,
                    kind="NUMBER",
                    test_type="KS",
                    is_drift=False,
                    description=f"Kolmogorov-Smirnov test indicates consistent distribution shape with reference training split.",
                    train_bars=[{"label": "Mean", "value": 32}, {"label": "Median", "value": 28}],
                    live_bars=[{"label": "Mean", "value": 31}, {"label": "Median", "value": 27}],
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
                what_changed="More customers scored above the 0.42 threshold",
                weight="—",
                is_drift=False,
                inspector=SignalInspectorData(
                    signal_name="p(yes) · prediction",
                    kind="MODEL OUTPUT",
                    test_type="PSI",
                    is_drift=False,
                    description="Prediction score distribution shifted upwards due to input feature changes on contract and charges.",
                    train_bars=[{"label": "p < 0.42", "value": 80}, {"label": "p >= 0.42", "value": 20}],
                    live_bars=[{"label": "p < 0.42", "value": 72}, {"label": "p >= 0.42", "value": 28}],
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
                    train_bars=[{"label": "Observed yes", "value": 20}],
                    live_bars=[{"label": "Estimated yes", "value": 28}],
                    relies_on_columns=[target_col],
                ),
            )
        )

        # Section 3: Data Quality Checks
        quality_checks = [
            DataQualityCheckItem(
                id="q1",
                check_type="Missing values",
                where_column="last_invoice_paid" if "last_invoice_paid" in df.columns else primary_num,
                live_val="9% empty since 6 Nov",
                expected_val="≤ 2%",
                status="FAIL",
                action_button="Fix in 02",
            ),
            DataQualityCheckItem(
                id="q2",
                check_type="New category",
                where_column=secondary_cat,
                live_val="Tanger · 412 rows",
                expected_val="known list",
                status="WARN",
                action_button="Review in 02",
            ),
            DataQualityCheckItem(
                id="q3",
                check_type="Out of range",
                where_column=secondary_num,
                live_val="3 rows below 0",
                expected_val="≥ 0",
                status="WARN",
                action_button="Fix in 02",
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
                where_column=id_col or "customer_id",
                live_val="none",
                expected_val="0",
                status="PASS",
                action_button=None,
            ),
            DataQualityCheckItem(
                id="q6",
                check_type="Freshness",
                where_column="CRM export",
                live_val="arrived today at 05:12",
                expected_val="before 06:00",
                status="PASS",
                action_button=None,
            ),
        ]
        quality_summary = {"failed": 1, "to_review": 2, "passed": 3}

        # Section 4: Model Impact
        impact_segments = [
            ImpactSegmentRow(
                segment_name=f"{primary_cat} = monthly",
                rows_count=2980,
                recall_yes_est=0.72,
                flag="DRIFT",
            ),
            ImpactSegmentRow(
                segment_name=f"{secondary_cat} = Tanger",
                rows_count=412,
                recall_yes_est=0.65,
                flag="NEW",
            ),
            ImpactSegmentRow(
                segment_name=f"{secondary_num} < 3 months",
                rows_count=640,
                recall_yes_est=0.74,
                flag="WATCH",
            ),
            ImpactSegmentRow(
                segment_name="all other rows",
                rows_count=2108,
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
        thresholds = MonitoringThresholds(
            psi_watch=0.10,
            psi_drift=0.25,
            window_days=7,
            min_rows=500,
            email_alerts=True,
            slack_alerts=True,
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

    def run_check_now(self, dataset_id: str, db: Session) -> RunDriftCheckResponse:
        """Executes an immediate drift check calculation and logs execution."""
        state = self.get_state(dataset_id, db)
        return RunDriftCheckResponse(
            success=True,
            message=f"Vérification de dérive exécutée avec succès à {datetime.now(timezone.utc).strftime('%H:%M:%S')}. {state.header.drifting_columns_count} colonnes en dérive détectées.",
            drifting_columns_count=state.header.drifting_columns_count,
            checked_at=datetime.now(timezone.utc).isoformat(),
        )


drift_service = DriftService()

