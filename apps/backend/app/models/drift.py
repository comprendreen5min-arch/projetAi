import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base
from app.models.base import GUID


class DriftCheckRun(Base):
    """Stores execution results for Step 08: Drift & Data Quality Monitoring.
    Tracks univariate PSI/KS/Chi2 tests per column, multivariate classifier drift,
    data quality checks, model impact estimates, and alert states.
    """
    __tablename__ = "drift_check_runs"

    id = Column(GUID(), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(GUID(), ForeignKey("datasets.id", ondelete="CASCADE"), nullable=False, index=True)

    production_model_name = Column(String(100), nullable=False)  # e.g. "data-xgb-07"
    reference_version_label = Column(String(50), nullable=False) # e.g. "data@v3"
    live_window_days = Column(Integer, default=7, nullable=False)
    
    # Alert summary
    drifting_columns_count = Column(Integer, default=2, nullable=False)
    drifting_columns = Column(JSON, default=list, nullable=False) # ["contract", "monthly_charges"]
    
    # Monitored signals
    signals = Column(JSON, default=list, nullable=False)
    multivariate_drift = Column(JSON, default=dict, nullable=False)
    
    # 30-day timeline points
    timeline = Column(JSON, default=list, nullable=False)
    
    # Data quality checks
    quality_checks = Column(JSON, default=list, nullable=False)
    
    # Model impact & segments
    estimated_recall = Column(Float, default=0.78, nullable=False)
    measured_recall = Column(Float, nullable=True) # None until outcomes arrive
    scored_positive_live = Column(Float, default=0.28, nullable=False)
    scored_positive_ref = Column(Float, default=0.20, nullable=False)
    impact_segments = Column(JSON, default=list, nullable=False)
    
    # Monitoring configuration & thresholds
    psi_watch_threshold = Column(Float, default=0.10, nullable=False)
    psi_drift_threshold = Column(Float, default=0.25, nullable=False)
    min_rows = Column(Integer, default=500, nullable=False)
    notification_channels = Column(JSON, default=dict, nullable=False)
    
    cli_command = Column(String(255), nullable=True)
    report_download_url = Column(String(255), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    dataset = relationship("Dataset")

    def __repr__(self):
        return f"<DriftCheckRun(dataset='{self.dataset_id}', model='{self.production_model_name}', drifting={self.drifting_columns_count})>"

