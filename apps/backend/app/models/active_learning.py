import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import GUID


class ActiveLearningRound(Base):
    """Represents an active learning cycle / round (Score, Pick, Check, Retrain, Measure).
    Stores the pool configuration, sampling strategy mix, 2D projection picks,
    hit rates, automation settings, and stop rules.
    """
    __tablename__ = "active_learning_rounds"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(GUID(), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)

    round_number = Column(Integer, nullable=False, default=1)
    status = Column(String(50), nullable=False, default="draft")  # "draft", "active", "done"
    scored_by_model = Column(String(100), nullable=False)        # e.g. "data-xgb-08"
    target_column = Column(String(100), nullable=False)

    pool_size = Column(Integer, nullable=False, default=0)
    budget_rows = Column(Integer, nullable=False, default=300)

    # Strategy breakdown (e.g. {"near_threshold": 120, "models_disagree": 75, "looks_wrong": 60, "weak_segments": 15, "random_control": 30})
    strategy_counts = Column(JSON, default=dict, nullable=False)

    # Round settings
    round_settings = Column(JSON, default=dict, nullable=False)

    # Stop rules and automation
    stop_rule = Column(JSON, default=dict, nullable=False)
    automation_settings = Column(JSON, default=dict, nullable=False)

    # Picked rows details and 2D map
    picks = Column(JSON, default=list, nullable=False)
    pool_projection = Column(JSON, default=list, nullable=False)  # 2D scatter coordinates for unchecked, checked, picked

    # Metrics & gains
    hit_rate = Column(Float, nullable=True)          # e.g. 0.40
    fixed_count = Column(Integer, nullable=True)     # e.g. 96
    checked_count = Column(Integer, nullable=True)   # e.g. 240
    hours_spent = Column(Float, nullable=True)       # e.g. 8.0
    recall_gain = Column(Float, nullable=True)       # e.g. +6.0%

    output_version_label = Column(String(50), default="v5", nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    dataset = relationship("Dataset")

    def __repr__(self):
        return f"<ActiveLearningRound(round={self.round_number}, status='{self.status}', dataset='{self.dataset_id}')>"

