import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import GUID


class TrainingRun(Base):
    """Represents a model training experiment execution, with hyperparameters,
    validation/test metrics, slices, threshold-cost curves, and promotion status.
    """
    __tablename__ = "training_runs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(GUID(), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)
    version_id = Column(GUID(), ForeignKey("dataset_versions.id", ondelete="CASCADE"), nullable=False, index=True)

    run_name = Column(String(100), nullable=False, index=True)  # e.g. "churn-xgb-08"
    model_type = Column(String(50), nullable=False)            # "xgboost", "lightgbm", "logistic", "catboost"
    status = Column(String(50), default="done", nullable=False) # "running", "done", "failed"
    tag = Column(String(50), nullable=True)                    # "candidate", "production", "baseline", "live"

    target_column = Column(String(100), nullable=False)
    positive_class = Column(String(50), default="yes", nullable=False)
    optimization_metric = Column(String(50), default="recall_yes", nullable=False)
    threshold = Column(Float, default=0.42, nullable=False)

    hyperparameters = Column(JSON, default=dict, nullable=False)
    metrics_val = Column(JSON, default=dict, nullable=False)
    metrics_test = Column(JSON, nullable=True)
    test_eval_count = Column(Integer, default=0, nullable=False)

    slices_metrics = Column(JSON, default=list, nullable=False)
    feature_importances = Column(JSON, default=list, nullable=False)
    cost_metrics = Column(JSON, default=dict, nullable=False)
    pr_curve_points = Column(JSON, default=list, nullable=False)

    trial_history = Column(JSON, default=list, nullable=False)
    current_trial = Column(Integer, default=40, nullable=False)
    total_trials = Column(Integer, default=40, nullable=False)

    execution_time_seconds = Column(Float, default=0.0, nullable=False)
    cpu_hours = Column(Float, default=0.1, nullable=False)
    error_message = Column(String(500), nullable=True)
    model_artifact_path = Column(String(500), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    dataset = relationship("Dataset")
    version = relationship("DatasetVersion")

    def __repr__(self):
        return f"<TrainingRun(name='{self.run_name}', model='{self.model_type}', status='{self.status}', tag='{self.tag}')>"

