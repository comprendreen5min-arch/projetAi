from typing import List, Optional, Any, Dict
from pydantic import BaseModel, Field


class PreRunChecks(BaseModel):
    test_hash: str
    test_rows: int
    smote_rows_in_train: int
    smote_in_val_or_test: int
    leak_columns_found: List[str]
    baseline_included: bool
    no_pii: bool


class FeatureItemConfig(BaseModel):
    name: str
    treatment: str
    is_leak: bool = False
    is_id: bool = False


class TrainingConfigResponse(BaseModel):
    dataset_version: str
    train_view: str
    splits_summary: str
    left_out_count: int
    available_models: List[str]
    target_column: str
    positive_class: str
    available_targets: List[str]
    available_pos_classes: List[str]
    features: List[FeatureItemConfig]
    checks: PreRunChecks
    cli_command: str


class StartRunRequest(BaseModel):
    dataset_version_hash: Optional[str] = None
    models_to_try: List[str] = Field(default_factory=lambda: ["logistic", "xgboost", "lightgbm"])
    train_view: str = "real_and_smote"
    target_column: Optional[str] = None
    positive_class: Optional[str] = None
    optimize_metric: str = "recall_yes"
    precision_constraint: Optional[float] = 0.60
    search_method: str = "bayesian"
    trials: int = 40
    time_limit_minutes: int = 30
    patience_trials: int = 8
    seed: int = 42
    worker: str = "CPU · 8 cores"


class TrainingRunListItem(BaseModel):
    id: str
    run_name: str
    data_version: str
    model_type: str
    status: str  # "running", "done", "failed"
    current_trial: int
    total_trials: int
    recall_val: Optional[float] = None
    execution_time_display: str
    tag: Optional[str] = None  # "candidate", "production", "baseline", "live"
    is_comparable: bool = True


class ConfusionMatrix(BaseModel):
    actual_yes_pred_yes: int
    actual_yes_pred_no: int
    actual_no_pred_yes: int
    actual_no_pred_no: int
    threshold: float


class ThresholdCostData(BaseModel):
    threshold: float
    cost_missed: float
    cost_retention: float
    flagged_per_month: int
    cost_per_month: float
    pr_curve: List[Dict[str, float]]
    prod_pr_curve: Optional[List[Dict[str, float]]] = None


class FeatureDriver(BaseModel):
    feature: str
    importance: float
    shap_value: float


class SliceItem(BaseModel):
    segment: str
    rows: int
    recall_yes: float
    flag: str  # "ok", "weak", "too_few"


class ErrorToInspect(BaseModel):
    customer_id: str
    label: str
    prob_yes: float
    why_wrong: str
    category: str  # "missed_churners", "wasted_offers", "confident_mistakes"
    action: str


class TrainingRunDetailResponse(BaseModel):
    id: str
    run_name: str
    data_version: str
    model_type: str
    status: str
    tag: Optional[str] = None
    current_trial: int
    total_trials: int
    eta_minutes: Optional[int] = None
    trial_history: List[Dict[str, Any]]
    recent_logs: List[str]
    split_evaluated: str
    val_rows: int
    test_rows: int
    test_locked: bool
    test_eval_count: int
    recall_yes: float
    precision_yes: float
    pr_auc: float
    calibration_error: float
    threshold_cost: ThresholdCostData
    confusion_matrix: ConfusionMatrix
    feature_drivers: List[FeatureDriver]
    slices: List[SliceItem]
    errors: List[ErrorToInspect]


class CompareRow(BaseModel):
    metric_name: str
    prod_val: str
    cand_val: str
    change: str
    is_positive: Optional[bool] = None


class PromotionChecklist(BaseModel):
    same_test_set: bool
    beats_production: bool
    no_slice_drops: bool
    model_card_generated: bool
    approved_by_second_person: bool


class CompareResponse(BaseModel):
    prod_run_name: str
    cand_run_name: str
    test_set_hash: str
    test_set_rows: int
    comparison_table: List[CompareRow]
    checklist: PromotionChecklist
    replay_command: str


class TrainingHeaderSummary(BaseModel):
    dataset_id: str
    dataset_name: str
    total_runs: int
    running_count: int
    failed_count: int
    data_version_label: str
    labels_fixed_since_v3: int
    compute_cpu_hours: float
    budget_hours: float
    production_run_name: str
    production_trained_date: str
    candidate_run_number: str
    candidate_run_name: str
    guardrails: List[Dict[str, Any]]

