from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class SplitConfig(BaseModel):
    train_ratio: float = Field(0.70, ge=0.1, le=0.9, description="Ratio du train (ex: 0.70)")
    val_ratio: float = Field(0.15, ge=0.05, le=0.45, description="Ratio de validation (ex: 0.15)")
    test_ratio: float = Field(0.15, ge=0.05, le=0.45, description="Ratio de test (ex: 0.15)")
    stratify_column: Optional[str] = Field(None, description="Colonne de stratification (défaut: target)")
    group_by_column: Optional[str] = Field(None, description="Colonne de groupement (ex: customer_id)")
    random_seed: int = Field(42, description="Graine aléatoire pour le découpage")


class TargetBalanceConfig(BaseModel):
    mode: Literal["keep", "20", "30", "50"] = Field("30", description="Objectif de part de la classe rare dans le train")
    custom_target_ratio: Optional[float] = Field(None, ge=0.01, le=0.50, description="Ratio personnalisé optionnel")


class TechniquesConfig(BaseModel):
    smote_nc_enabled: bool = Field(True, description="Activer SMOTE-NC pour la classe rare")
    smote_k_neighbors: int = Field(5, ge=1, le=50, description="Nombre de voisins k pour SMOTE-NC")
    undersample_enabled: bool = Field(True, description="Sous-échantillonner la classe majoritaire")
    undersample_seed: int = Field(42, description="Graine pour le sous-échantillonnage")
    light_noise_enabled: bool = Field(False, description="Ajouter un bruit léger sur les colonnes numériques générées")
    noise_strength_pct: float = Field(2.0, ge=0.1, le=20.0, description="Force du bruit en % de l'écart-type")
    class_weights_enabled: bool = Field(False, description="Calculer des poids de classes au lieu de créer des lignes")
    class_weights_strategy: Optional[str] = Field("balanced", description="Stratégie pour les poids de classes")


class GuardrailResult(BaseModel):
    key: str
    label: str
    passed: bool
    description: str
    details: Optional[Dict[str, Any]] = None


class AugmentationPreviewRequest(BaseModel):
    source_version_hash: str = Field(..., description="Hash de la version source (ex: v2)")
    target_column: str = Field(..., description="Colonne cible du dataset")
    split_config: SplitConfig = Field(default_factory=SplitConfig)
    balance_config: TargetBalanceConfig = Field(default_factory=TargetBalanceConfig)
    techniques: TechniquesConfig = Field(default_factory=TechniquesConfig)


class AugmentationPreviewResponse(BaseModel):
    rows_in_train_before: int
    rows_in_train_after: int
    rows_generated: int
    rows_undersampled: int
    test_set_size: int
    val_set_size: int
    actual_split_ratios: Dict[str, float]
    minority_class_label: Any
    majority_class_label: Any
    minority_pct_before: float
    minority_pct_after: float
    balance_score_before: int
    balance_score_after: int
    balance_distribution: Dict[str, Any]
    guardrails: List[GuardrailResult]
    sample_preview: List[Dict[str, Any]]
    recipe: Dict[str, Any]
    class_weights: Optional[Dict[str, float]] = None


class AugmentationApplyRequest(BaseModel):
    source_version_hash: str = Field(..., description="Hash de la version source (ex: v2)")
    target_column: str = Field(..., description="Colonne cible du dataset")
    split_config: SplitConfig = Field(default_factory=SplitConfig)
    balance_config: TargetBalanceConfig = Field(default_factory=TargetBalanceConfig)
    techniques: TechniquesConfig = Field(default_factory=TechniquesConfig)


class AugmentationApplyResponse(BaseModel):
    new_version_hash: str
    new_version_id: str
    parent_version_hash: str
    total_rows: int
    rows_in_train: int
    rows_generated: int
    rows_undersampled: int
    transformation_name: str
    parameters: Dict[str, Any]
    recipe: Dict[str, Any]
    before_profile: Dict[str, Any]
    after_profile: Dict[str, Any]
    balance_score_delta: int
    guardrails: List[GuardrailResult]


class ComparisonMetricResult(BaseModel):
    mean: float = Field(..., description="Moyenne sur les 5 graines (en %)")
    std: float = Field(..., description="Écart-type sur les 5 graines (en %)")
    seed_values: List[float] = Field(default_factory=list, description="Valeurs obtenues pour chaque graine")


class ModelComparisonMetrics(BaseModel):
    recall: ComparisonMetricResult
    precision: ComparisonMetricResult
    f1_score: ComparisonMetricResult


class AugmentationComparisonRequest(BaseModel):
    source_version_hash: str = Field(..., description="Hash de la version source")
    target_column: str = Field(..., description="Colonne cible")
    split_config: SplitConfig = Field(default_factory=SplitConfig)
    balance_config: TargetBalanceConfig = Field(default_factory=TargetBalanceConfig)
    techniques: TechniquesConfig = Field(default_factory=TechniquesConfig)
    model_type: str = Field(default="logistic_regression", description="Modèle utilisé (logistic_regression ou random_forest)")
    seeds: List[int] = Field(default=[42, 43, 44, 45, 46], description="Liste des 5 graines aléatoires")


class AugmentationComparisonResponse(BaseModel):
    model_type: str
    model_label: str
    test_total_count: int
    test_positive_count: int
    minority_class_label: Any
    baseline_metrics: ModelComparisonMetrics
    augmented_metrics: ModelComparisonMetrics
    deltas: Dict[str, float]
    seeds_used: List[int]
    warning_disclaimer: str


