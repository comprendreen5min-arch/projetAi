from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field


class DriftHeaderSummary(BaseModel):
    dataset_id: str
    dataset_name: str
    production_model_name: str
    reference_version_label: str
    reference_subtitle: str
    live_window_label: str
    live_window_subtitle: str
    signals_watched_count: str
    signals_watched_subtitle: str
    last_check_time: str
    last_check_subtitle: str
    drifting_columns_count: int
    drifting_columns: List[str]


class DriftTimelinePoint(BaseModel):
    date: str
    contract: float
    monthly_charges: float
    city: float


class DriftTimelineResponse(BaseModel):
    columns: List[str]
    points: List[DriftTimelinePoint]
    annotation_date: str = "1 Nov · new prices and offer"
    watch_threshold: float = 0.10
    drift_threshold: float = 0.25


class SignalInspectorData(BaseModel):
    signal_name: str
    kind: str
    test_type: str
    is_drift: bool = False
    description: str
    train_bars: List[Dict[str, Any]]
    live_bars: List[Dict[str, Any]]
    relies_on_columns: List[str]


class DriftSignalItem(BaseModel):
    signal: str
    kind: str
    test: str
    what_changed: str
    weight: str
    is_drift: bool = False
    inspector: SignalInspectorData


class DataQualityCheckItem(BaseModel):
    id: str
    check_type: str
    where_column: str
    live_val: str
    expected_val: str
    status: str  # "FAIL", "WARN", "PASS"
    action_button: Optional[str] = None


class ImpactSegmentRow(BaseModel):
    segment_name: str
    rows_count: int
    recall_yes_est: float
    flag: str  # "DRIFT", "NEW", "WATCH", "OK"


class ModelImpactData(BaseModel):
    recall_yes_estimated: float
    scored_yes_live_pct: float
    scored_yes_train_pct: float
    recall_yes_measured: Optional[float] = None
    segments: List[ImpactSegmentRow]


class ActionDecisionCard(BaseModel):
    category: str  # "IF IT IS EXPECTED", "IF IT IS A DATA BUG", "RECOMMENDED", "IF IT KEEPS GROWING"
    title: str
    description: str
    button_label: str
    action_type: str
    is_recommended: bool = False


class MonitoringThresholds(BaseModel):
    psi_watch: float = 0.10
    psi_drift: float = 0.25
    window_days: int = 7
    min_rows: int = 500
    email_alerts: bool = True
    slack_alerts: bool = True
    webhook_url: Optional[str] = None


class DriftGuardrailItem(BaseModel):
    id: str
    status: str  # "ok", "warning"
    title: str
    description: str


class DriftStateResponse(BaseModel):
    header: DriftHeaderSummary
    timeline: DriftTimelineResponse
    signals: List[DriftSignalItem]
    quality_checks: List[DataQualityCheckItem]
    quality_summary: Dict[str, int]  # {"failed": 1, "to_review": 2, "passed": 3}
    model_impact: ModelImpactData
    decisions: List[ActionDecisionCard]
    thresholds: MonitoringThresholds
    cli_command: str
    guardrails: List[DriftGuardrailItem]


class UpdateDriftSettingsRequest(BaseModel):
    psi_watch: Optional[float] = None
    psi_drift: Optional[float] = None
    window_days: Optional[int] = None
    min_rows: Optional[int] = None
    email_alerts: Optional[bool] = None
    slack_alerts: Optional[bool] = None
    webhook_url: Optional[str] = None


class RunDriftCheckResponse(BaseModel):
    success: bool
    message: str
    drifting_columns_count: int
    checked_at: str

