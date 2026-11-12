from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field


class StrategyItem(BaseModel):
    id: str  # "near_threshold", "models_disagree", "looks_wrong", "weak_segments", "random_control"
    title: str
    subtitle: str
    rows: int
    percentage: float
    min_pct: Optional[int] = None


class RoundSettings(BaseModel):
    rows_this_round: int = 300
    pool_source: str = "New CRM rows + \"not yet\""
    skip_checked_days: int = 90
    one_row_per_customer: bool = True
    label_maturity_days: int = 60
    maturity_subtitle: str = "62 'not yet' rows · 38 mature on 01 Dec and come back automatically."
    analyst_time: str = "≈ 1.3 days"
    expected_fixes: str = "≈ 105 fixes (35 %)"


class PickRowItem(BaseModel):
    customer_id: str
    why_picked: str
    p_yes: float
    label: str
    strategy: str
    x: Optional[float] = None
    y: Optional[float] = None


class PoolMapPoint(BaseModel):
    id: str
    x: float
    y: float
    status: str  # "unchecked", "checked", "picked"
    cluster: Optional[str] = None


class RoundHistoryItem(BaseModel):
    round_number: int
    status: str  # "done", "draft", "upcoming"
    checked_count: Optional[int] = None
    fixed_count: Optional[int] = None
    hours: Optional[float] = None
    data_version: str
    model_name: Optional[str] = None
    recall_gain: Optional[str] = None


class LoopStep(BaseModel):
    step_number: int
    title: str
    info: str
    status: str  # "done", "active", "waiting"
    detail: str


class AutomationSettings(BaseModel):
    start_on_new_crm: bool = True
    start_on_drift: bool = True
    requeue_not_yet: bool = True
    retrain_after_round: bool = True
    notify_reviewer: bool = False
    auto_promote: bool = False


class GuardrailItem(BaseModel):
    id: str
    status: str  # "ok", "warning"
    title: str
    description: str


class ActiveLearningHeaderSummary(BaseModel):
    dataset_id: str
    dataset_name: str
    round_number: int = 2
    round_status: str = "draft"
    scored_by_model: str
    target_column: str
    pool_size: int
    pool_breakdown: str
    budget_rows: int
    budget_subtitle: str
    hit_rate_round_1: float
    hit_rate_subtitle: str
    output_version: str
    output_subtitle: str


class ActiveLearningStateResponse(BaseModel):
    header: ActiveLearningHeaderSummary
    loop_steps: List[LoopStep]
    rounds_history: List[RoundHistoryItem]
    strategies: List[StrategyItem]
    round_settings: RoundSettings
    total_percentage: float
    total_rows: int
    picks: List[PickRowItem]
    pool_points: List[PoolMapPoint]
    weak_cluster_label: str
    hit_rate_picked: float
    hit_rate_random: float
    stop_rule_fixes_pct: int
    stop_rule_recall_gain_pts: int
    automation: AutomationSettings
    guardrails: List[GuardrailItem]


class UpdateRoundSettingsRequest(BaseModel):
    rows_this_round: Optional[int] = None
    strategy_counts: Optional[Dict[str, int]] = None
    round_settings: Optional[Dict[str, Any]] = None
    automation: Optional[Dict[str, bool]] = None
    stop_rule: Optional[Dict[str, int]] = None


class SendToLabelingRequest(BaseModel):
    round_number: int = 2
    target_split: str = "train"
    notes: Optional[str] = None


class SendToLabelingResponse(BaseModel):
    success: bool
    message: str
    new_version_label: str
    rows_enqueued: int
    dataset_id: str

