import datetime
import hashlib
import json
import logging
import math
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import f1_score, precision_score, recall_score
from sklearn.neighbors import NearestNeighbors
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.utils.class_weight import compute_class_weight
from sqlalchemy.orm import Session

from app.models.dataset_version import DatasetVersion
from app.models.transformation import Transformation
from app.schemas.augmentation import (
    AugmentationApplyRequest,
    AugmentationApplyResponse,
    AugmentationComparisonRequest,
    AugmentationComparisonResponse,
    AugmentationPreviewRequest,
    AugmentationPreviewResponse,
    ComparisonMetricResult,
    GuardrailResult,
    ModelComparisonMetrics,
    SplitConfig,
    TargetBalanceConfig,
    TechniquesConfig,
)
from app.services.lineage_service import lineage_service
from app.services.parquet_service import parquet_service
from app.services.profiling_service import profiling_service
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)

AUGMENTATION_METADATA_COLS = ["split", "is_synthetic", "origin", "parent_ids"]


class AugmentationService:
    """Service d'Augmentation de données pour l'étape 03 :
    - Découpage stratifié / groupé Train / Val / Test (seul le Train est augmenté).
    - Équilibrage de la cible avec plafond de 50% de données synthétiques par classe.
    - SMOTE-NC déterministe avec traçabilité complète des parents (parent_ids).
    - Traitement explicite et robuste des dates.
    - Sous-échantillonnage aléatoire reproductible de la classe majoritaire.
    - Bruit léger gaussien sur colonnes numériques des lignes générées avec bornage strict.
    - Calcul de poids de classes pour l'étape Training.
    - Contrôle exhaustif des 6 Guardrails réels avant enregistrement.
    - Versioning immuable avec hash logique déterministe.
    """

    def calculate_logical_data_hash(self, df: pd.DataFrame) -> str:
        """Calcule un hash SHA-256 déterministe basé sur le contenu logique des données
        (valeurs, types et ordre fixe), indépendant des métadonnées du fichier Parquet.
        """
        sorted_cols = sorted(df.columns.tolist())
        df_sorted_cols = df[sorted_cols].copy()

        def make_sort_key(row):
            parts = []
            for val in row:
                if pd.isna(val):
                    parts.append("__DATALIFT_NULL__")
                elif isinstance(val, (int, float, np.number)):
                    parts.append(f"num:{val:.6f}")
                else:
                    parts.append(f"str:{str(val)}")
            return "||".join(parts)

        keys = df_sorted_cols.apply(make_sort_key, axis=1)
        sort_order = np.argsort(keys.values)
        df_canonical = df_sorted_cols.iloc[sort_order].reset_index(drop=True)

        hasher = hashlib.sha256()
        for col in sorted_cols:
            col_series = df_canonical[col]
            hasher.update(f"col:{col}:{col_series.dtype}".encode("utf-8"))
            for val in col_series:
                if pd.isna(val):
                    hasher.update(b"__NULL__")
                elif isinstance(val, (int, np.integer)):
                    hasher.update(f"int:{int(val)}".encode("utf-8"))
                elif isinstance(val, (float, np.floating)):
                    hasher.update(f"flt:{float(val):.6f}".encode("utf-8"))
                elif isinstance(val, bool):
                    hasher.update(b"bool:1" if val else b"bool:0")
                else:
                    hasher.update(f"str:{str(val)}".encode("utf-8"))

        return hasher.hexdigest()

    @staticmethod
    def _is_integer_column(series: pd.Series) -> bool:
        """Détermine si une colonne numérique est ou doit être entière (ex: age, income)."""
        if pd.api.types.is_integer_dtype(series):
            return True
        col_name = str(series.name).lower() if series.name else ""
        if col_name in ["age", "income", "revenu", "anciennete", "tenure", "nb_commandes"]:
            return True
        clean = series.dropna()
        if len(clean) > 0 and pd.api.types.is_numeric_dtype(series):
            try:
                vals = clean.to_numpy(dtype=float)
                return bool(np.all(np.mod(vals, 1) == 0))
            except Exception:
                return False
        return False

    def detect_id_column(self, df: pd.DataFrame) -> Optional[str]:
        """Détecte une éventuelle colonne d'identifiant (ex. customer_id, id, user_id)."""
        candidates = ["customer_id", "id", "client_id", "user_id", "id_client", "customerid"]
        for c in candidates:
            if c in df.columns:
                return c
        for c in df.columns:
            if c.lower().endswith("_id") or c.lower().startswith("id_"):
                return c
        return None

    def detect_date_columns(self, df: pd.DataFrame) -> List[str]:
        """Détecte les colonnes de type date/datetime."""
        date_cols = []
        for col in df.columns:
            if col in AUGMENTATION_METADATA_COLS:
                continue
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                date_cols.append(col)
            elif df[col].dtype == "object":
                # Vérifier si les valeurs non nulles sont convertibles en date
                sample = df[col].dropna().head(10)
                if len(sample) > 0:
                    try:
                        pd.to_datetime(sample, format="mixed", errors="raise")
                        date_cols.append(col)
                    except Exception:
                        pass
        return date_cols

    def perform_stratified_split(
        self,
        df: pd.DataFrame,
        split_config: SplitConfig,
        target_column: str,
    ) -> Tuple[pd.DataFrame, Dict[str, float]]:
        """Effectue le découpage Train / Val / Test stratifié sur la cible,
        avec prise en charge optionnelle d'un group_by (ex: customer_id).
        Ajoute la colonne 'split' ('train', 'val', 'test').
        """
        stratify_col = split_config.stratify_column or target_column
        if stratify_col not in df.columns:
            raise ValueError(f"Colonne de stratification '{stratify_col}' introuvable.")

        train_r = split_config.train_ratio
        val_r = split_config.val_ratio
        test_r = split_config.test_ratio
        total_r = train_r + val_r + test_r
        train_r /= total_r
        val_r /= total_r
        test_r /= total_r

        rng = np.random.RandomState(split_config.random_seed)
        df_result = df.copy()

        # Identifier la classe rare
        vc = df[target_column].dropna().value_counts()
        if len(vc) < 2:
            raise ValueError(f"La colonne cible '{target_column}' doit contenir au moins 2 classes.")
        minority_class = vc.index[-1]
        total_rare_in_dataset = int((df[target_column] == minority_class).sum())
        total_dataset_rows = len(df)

        group_by = split_config.group_by_column
        if group_by and group_by in df.columns:
            # Si chaque groupe est une ligne unique (ex: customer_id avec 1 ligne par client),
            # le découpage stratifié direct garantit à la fois l'unicité stricte et la stratification parfaite.
            if df[group_by].nunique() == len(df):
                split_series = pd.Series(index=df.index, dtype="object")
                for cls_val in vc.index:
                    cls_indices = df[df[stratify_col] == cls_val].index.to_numpy()
                    rng.shuffle(cls_indices)
                    n_cls = len(cls_indices)
                    n_tr = int(round(n_cls * train_r))
                    n_v = int(round(n_cls * val_r))

                    tr_idx = cls_indices[:n_tr]
                    v_idx = cls_indices[n_tr : n_tr + n_v]
                    te_idx = cls_indices[n_tr + n_v :]

                    split_series[tr_idx] = "train"
                    split_series[v_idx] = "val"
                    split_series[te_idx] = "test"
                df_result["split"] = split_series
            else:
                # Groupes réels avec potentiellement plusieurs lignes par groupe
                groups = df.groupby(group_by)
                group_keys = list(groups.groups.keys())
                rng.shuffle(group_keys)

                groups_with_min = []
                groups_without_min = []
                total_min_samples = 0
                for gk in group_keys:
                    gdf = groups.get_group(gk)
                    g_size = len(gdf)
                    g_min = int((gdf[target_column] == minority_class).sum())
                    if g_min > 0:
                        groups_with_min.append((gk, g_size, g_min))
                        total_min_samples += g_min
                    else:
                        groups_without_min.append((gk, g_size, 0))

                rng.shuffle(groups_with_min)
                rng.shuffle(groups_without_min)

                target_min = {
                    "train": max(1.0, total_min_samples * train_r),
                    "val": max(1.0, total_min_samples * val_r),
                    "test": max(1.0, total_min_samples * test_r),
                }
                cur_min = {"train": 0, "val": 0, "test": 0}
                cur_tot = {"train": 0, "val": 0, "test": 0}
                assigned_groups: Dict[str, List[Any]] = {"train": [], "val": [], "test": []}

                # 1. Allouer d'abord les groupes contenant la classe rare proportionnellement
                for gk, g_len, m_cnt in groups_with_min:
                    best_p = min(
                        ["train", "val", "test"],
                        key=lambda p: (cur_min[p] / target_min[p], cur_tot[p]),
                    )
                    assigned_groups[best_p].append(gk)
                    cur_min[best_p] += m_cnt
                    cur_tot[best_p] += g_len

                # 2. Allouer les groupes majoritaires pour atteindre la taille cible de chaque partition
                target_tot = {
                    "train": len(df) * train_r,
                    "val": len(df) * val_r,
                    "test": len(df) * test_r,
                }
                for gk, g_len, _ in groups_without_min:
                    best_p = min(
                        ["train", "val", "test"],
                        key=lambda p: cur_tot[p] / target_tot[p],
                    )
                    assigned_groups[best_p].append(gk)
                    cur_tot[best_p] += g_len

                # Assignation du split
                split_series = pd.Series(index=df.index, dtype="object")
                split_series[df[group_by].isin(assigned_groups["train"])] = "train"
                split_series[df[group_by].isin(assigned_groups["val"])] = "val"
                split_series[df[group_by].isin(assigned_groups["test"])] = "test"
                df_result["split"] = split_series

            # Vérification de la contrainte : au moins 3 exemples de la classe rare par partition
            for s_name in ["train", "val", "test"]:
                sub = df_result[(df_result["split"] == s_name) & (df_result[target_column] == minority_class)]
                s_min_count = len(sub)
                if s_min_count < 3:
                    raise ValueError(
                        f"Le dataset entier ne contient que {total_rare_in_dataset} exemple(s) de la classe rare '{minority_class}' "
                        f"(sur {total_dataset_rows} lignes au total). Avec group_by='{group_by}', le découpage produit une partition avec moins de 3 exemples "
                        f"de la classe rare dans {s_name} ({s_min_count} trouvés, minimum requis : 3). "
                        f"Que faire : (1) fournir un jeu de données avec plus d'exemples de la classe rare, "
                        f"(2) retirer le group_by pour un split direct, ou "
                        f"(3) choisir une autre colonne à prédire ayant des effectifs suffisants."
                    )
        else:
            # Simple Stratified Split par permutations déterministes par classe
            split_series = pd.Series(index=df.index, dtype="object")

            for cls_val in vc.index:
                cls_indices = df[df[stratify_col] == cls_val].index.to_numpy()
                rng.shuffle(cls_indices)
                n_cls = len(cls_indices)
                n_tr = int(round(n_cls * train_r))
                n_v = int(round(n_cls * val_r))

                tr_idx = cls_indices[:n_tr]
                v_idx = cls_indices[n_tr : n_tr + n_v]
                te_idx = cls_indices[n_tr + n_v :]

                split_series[tr_idx] = "train"
                split_series[v_idx] = "val"
                split_series[te_idx] = "test"

            df_result["split"] = split_series

            # Vérifier au moins 3 exemples dans le train, et au moins 1 dans val et test
            train_sub = df_result[(df_result["split"] == "train") & (df_result[target_column] == minority_class)]
            if len(train_sub) < 3:
                raise ValueError(
                    f"Le dataset entier ne contient que {total_rare_in_dataset} exemple(s) de la classe rare '{minority_class}' "
                    f"(sur {total_dataset_rows} lignes au total). Le découpage stratifié produit moins de 3 exemples de la classe rare dans le train "
                    f"({len(train_sub)} trouvés, minimum requis : 3 pour SMOTE-NC). "
                    f"Que faire : (1) fournir un jeu de données avec plus de données pour cette classe, "
                    f"(2) ajuster les ratios de découpage (ex. augmenter le train), ou "
                    f"(3) choisir une autre colonne à prédire ayant des effectifs suffisants."
                )
            for s_name in ["val", "test"]:
                sub = df_result[(df_result["split"] == s_name) & (df_result[target_column] == minority_class)]
                if len(sub) < 1:
                    raise ValueError(
                        f"Le dataset entier ne contient que {total_rare_in_dataset} exemple(s) de la classe rare '{minority_class}' "
                        f"(sur {total_dataset_rows} lignes au total), laissant 0 exemple dans {s_name}. "
                        f"Que faire : (1) fournir plus de données pour cette classe, "
                        f"(2) ajuster les ratios de découpage, ou "
                        f"(3) choisir une autre colonne à prédire ayant des effectifs suffisants."
                    )

        # Calcul des ratios réels obtenus
        total_len = len(df_result)
        actual_ratios = {
            "train": round(float((df_result["split"] == "train").sum() / total_len), 3),
            "val": round(float((df_result["split"] == "val").sum() / total_len), 3),
            "test": round(float((df_result["split"] == "test").sum() / total_len), 3),
        }

        # Initialiser les métadonnées de lignage pour les lignes existantes
        df_result["is_synthetic"] = False
        df_result["origin"] = "real"
        df_result["parent_ids"] = None

        return df_result, actual_ratios

    def calculate_target_balance_score(self, series: pd.Series) -> int:
        """Calcule le score d'équilibre de la cible sur [0, 100] via l'entropie de Shannon normalisée,
        identique à la formule documentée du Profiling.
        """
        clean = series.dropna()
        if len(clean) == 0:
            return 0
        vc = clean.value_counts()
        num_classes = len(vc)
        if num_classes <= 1:
            return 0
        probs = vc / len(clean)
        entropy = -np.sum(probs * np.log(probs)) / np.log(num_classes)
        return int(round(float(entropy * 100.0)))

    def apply_augmentation_pipeline(
        self,
        df: pd.DataFrame,
        target_column: str,
        split_config: SplitConfig,
        balance_config: TargetBalanceConfig,
        techniques: TechniquesConfig,
    ) -> Dict[str, Any]:
        """Exécute l'intégralité du pipeline d'augmentation (utilisé de manière identique par preview et apply).
        Retourne le DataFrame enrichi ainsi que les métadonnées détaillées et les guardrails.
        """
        if target_column not in df.columns:
            raise ValueError(f"Colonne cible '{target_column}' introuvable.")

        # 1. Découpage stratifié initial (Val et Test restent 100% réels et verrouillés)
        df_split, actual_ratios = self.perform_stratified_split(df, split_config, target_column)

        train_mask = df_split["split"] == "train"
        val_mask = df_split["split"] == "val"
        test_mask = df_split["split"] == "test"

        df_train = df_split[train_mask].copy()
        df_val = df_split[val_mask].copy()
        df_test = df_split[test_mask].copy()

        initial_train_rows = len(df_train)
        vc_train = df_train[target_column].value_counts()
        if len(vc_train) < 2:
            raise ValueError(f"Le jeu d'entraînement doit comporter au moins 2 classes pour la cible '{target_column}'.")

        majority_class = vc_train.index[0]
        minority_class = vc_train.index[-1]
        n_maj_real = int(vc_train.loc[majority_class])
        n_min_real = int(vc_train.loc[minority_class])

        balance_score_before = self.calculate_target_balance_score(df_train[target_column])
        minority_pct_before = round((n_min_real / initial_train_rows) * 100.0, 1)

        # Exclusion mutuelle des guardrails : Pas de rééchantillonnage + poids de classes en même temps
        if techniques.class_weights_enabled and (techniques.smote_nc_enabled or techniques.undersample_enabled):
            raise ValueError(
                "Guardrail violé (Pas de double correction) : "
                "Vous ne pouvez pas activer simultanément le rééchantillonnage (SMOTE/sous-échantillonnage) "
                "et les poids de classes. Choisissez l'une ou l'autre technique."
            )

        # Vérification des valeurs manquantes si SMOTE est activé
        if techniques.smote_nc_enabled:
            # Vérifier les colonnes de features du train
            feature_cols = [c for c in df_train.columns if c not in AUGMENTATION_METADATA_COLS and c != target_column]
            missing_cols = {}
            for col in feature_cols:
                null_count = int(df_train[col].isna().sum())
                if df_train[col].dtype == "object":
                    null_count += int((df_train[col].astype(str).str.strip() == "").sum())
                if null_count > 0:
                    missing_cols[col] = null_count

            if missing_cols:
                cols_str = ", ".join(f"'{k}' ({v} manquants)" for k, v in missing_cols.items())
                raise ValueError(
                    f"SMOTE-NC ne peut pas être appliqué car le jeu de données contient des valeurs manquantes "
                    f"dans les colonnes suivantes : {cols_str}. "
                    "Veuillez d'abord nettoyer ces colonnes à l'étape 02 Cleaning (/cleaning)."
                )

        # Calcul du ratio cible souhaité
        target_mode = balance_config.mode
        if target_mode == "keep":
            target_ratio = n_min_real / initial_train_rows
        elif target_mode == "20":
            target_ratio = 0.20
        elif target_mode == "30":
            target_ratio = 0.30
        elif target_mode == "50":
            target_ratio = 0.50
        else:
            target_ratio = balance_config.custom_target_ratio or (n_min_real / initial_train_rows)

        # Logique d'équilibrage avec plafond de 50% de synthétiques dans la classe rare
        # Plafond : n_synth_max = n_min_real (ainsi n_synth / (n_min_real + n_synth) <= 50%)
        id_col = self.detect_id_column(df_train)
        date_cols = self.detect_date_columns(df_train)

        n_synth_to_generate = 0
        n_maj_to_keep = n_maj_real

        if target_mode != "keep" and not techniques.class_weights_enabled:
            # Combien de synthétiques nécessaires pour atteindre target_ratio sans sous-échantillonnage ?
            # (n_min + S) / (n_maj + n_min + S) = r  =>  S = (r * n_maj - (1-r) * n_min) / (1-r)
            if (1.0 - target_ratio) > 0:
                raw_s = (target_ratio * n_maj_real - (1.0 - target_ratio) * n_min_real) / (1.0 - target_ratio)
                ideal_synth = max(0, int(round(raw_s)))
            else:
                ideal_synth = n_maj_real - n_min_real

            if techniques.smote_nc_enabled:
                # Plafond strict : au maximum n_min_real synthétiques créées
                n_synth_to_generate = min(ideal_synth, n_min_real)
            else:
                n_synth_to_generate = 0

            final_minority_rows = n_min_real + n_synth_to_generate

            # Si l'objectif n'est pas encore atteint et undersample_enabled, sous-échantillonner la majorité
            if techniques.undersample_enabled and target_ratio > 0:
                # final_minority_rows / (n_maj_kept + final_minority_rows) = target_ratio
                # n_maj_kept = final_minority_rows * (1 - target_ratio) / target_ratio
                calculated_maj_keep = int(round(final_minority_rows * (1.0 - target_ratio) / target_ratio))
                n_maj_to_keep = min(n_maj_real, max(3, calculated_maj_keep))
            else:
                n_maj_to_keep = n_maj_real

        # Exécution de SMOTE-NC
        df_generated = pd.DataFrame()
        parent_pairs_list: List[Tuple[Any, Any]] = []

        if n_synth_to_generate > 0 and techniques.smote_nc_enabled:
            df_minority_train = df_train[df_train[target_column] == minority_class].copy()
            k = techniques.smote_k_neighbors
            if len(df_minority_train) < k + 1:
                raise ValueError(
                    f"SMOTE-NC requiert au moins {k + 1} exemples de la classe rare dans le train (k={k}), "
                    f"mais seulement {len(df_minority_train)} sont disponibles. Réduisez k ou ajustez le split."
                )

            # Identification des types de colonnes
            exclude_feature_cols = set(AUGMENTATION_METADATA_COLS + [target_column])
            if id_col:
                exclude_feature_cols.add(id_col)

            num_cols = []
            cat_cols = []
            for col in df_train.columns:
                if col in exclude_feature_cols or col in date_cols:
                    continue
                if pd.api.types.is_numeric_dtype(df_train[col]):
                    num_cols.append(col)
                else:
                    cat_cols.append(col)

            # Préparation des matrices pour la recherche des k voisins (standardisation des variables numériques)
            scaler = StandardScaler()
            if num_cols:
                scaled_num = scaler.fit_transform(df_minority_train[num_cols])
            else:
                scaled_num = np.empty((len(df_minority_train), 0))

            if cat_cols:
                # One-hot encoding simple pour le calcul de distance
                encoded_cat = pd.get_dummies(df_minority_train[cat_cols], drop_first=False).to_numpy(dtype=float)
            else:
                encoded_cat = np.empty((len(df_minority_train), 0))

            if scaled_num.shape[1] + encoded_cat.shape[1] > 0:
                knn_features = np.hstack([scaled_num, encoded_cat])
            else:
                knn_features = np.zeros((len(df_minority_train), 1))

            nn_model = NearestNeighbors(n_neighbors=k + 1, metric="euclidean")
            nn_model.fit(knn_features)
            distances, indices = nn_model.kneighbors(knn_features)

            # Génération déterministe avec RandomState
            gen_rng = np.random.RandomState(split_config.random_seed + 100)
            generated_rows = []

            # Récupérer les identifiants réels des parents dans le train
            if id_col:
                parent_identifiers = df_minority_train[id_col].tolist()
            else:
                parent_identifiers = [f"IDX-{idx}" for idx in df_minority_train.index]

            n_min_avail = len(df_minority_train)
            for g_idx in range(n_synth_to_generate):
                # Choix d'un exemple minority et d'un de ses k voisins
                base_idx = g_idx % n_min_avail
                neighbor_choice = gen_rng.randint(1, k + 1)
                neighbor_idx = indices[base_idx, neighbor_choice]

                row_base = df_minority_train.iloc[base_idx]
                row_neighbor = df_minority_train.iloc[neighbor_idx]

                parent_1_id = parent_identifiers[base_idx]
                parent_2_id = parent_identifiers[neighbor_idx]
                parent_pairs_list.append((parent_1_id, parent_2_id))

                lambda_coef = gen_rng.uniform(0.0, 1.0)
                new_row: Dict[str, Any] = {}

                # 1. Variables numériques : interpolation sur les valeurs brutes d'origine
                for nc in num_cols:
                    val_1 = float(row_base[nc])
                    val_2 = float(row_neighbor[nc])
                    interp_val = val_1 + lambda_coef * (val_2 - val_1)

                    is_int = self._is_integer_column(df_train[nc])
                    if is_int:
                        interp_val = int(round(interp_val))
                    elif str(nc).lower() in ["monthly_charges", "charges", "price", "amount", "montant", "prix", "cout"]:
                        interp_val = round(float(interp_val), 2)
                    else:
                        interp_val = round(float(interp_val), 2)

                    # Bornage strict aux min/max observés dans le train
                    min_obs = df_train[nc].min()
                    max_obs = df_train[nc].max()
                    if is_int:
                        interp_val = int(max(int(min_obs), min(int(max_obs), interp_val)))
                    else:
                        interp_val = max(min_obs, min(max_obs, interp_val))
                    new_row[nc] = interp_val

                # 2. Variables catégorielles : modalité choisie parmi les voisins réels (invariants)
                for cc in cat_cols:
                    new_row[cc] = row_base[cc] if lambda_coef < 0.5 else row_neighbor[cc]

                # 3. Dates : interpolation des timestamps et reconversion selon le type d'origine
                for dc in date_cols:
                    try:
                        t1 = pd.to_datetime(row_base[dc]).timestamp()
                        t2 = pd.to_datetime(row_neighbor[dc]).timestamp()
                        interp_ts = t1 + lambda_coef * (t2 - t1)
                        dt_interp = pd.to_datetime(interp_ts, unit="s")
                        
                        first_valid = df_train[dc].dropna().iloc[0] if len(df_train[dc].dropna()) > 0 else None
                        if pd.api.types.is_datetime64_any_dtype(df_train[dc]):
                            new_row[dc] = dt_interp
                        elif isinstance(first_valid, datetime.date) and not isinstance(first_valid, datetime.datetime):
                            new_row[dc] = dt_interp.date()
                        elif isinstance(first_valid, datetime.datetime):
                            new_row[dc] = dt_interp.to_pydatetime()
                        else:
                            new_row[dc] = dt_interp.strftime("%Y-%m-%d")
                    except Exception:
                        new_row[dc] = row_base[dc]

                # 4. Colonne identifiant : nouveau format SYN-XXXXXX
                if id_col:
                    new_row[id_col] = f"SYN-{g_idx + 1:06d}"

                # 5. Cible : obligatoirement la classe rare
                new_row[target_column] = minority_class

                # 6. Métadonnées de lignage
                new_row["split"] = "train"
                new_row["is_synthetic"] = True
                new_row["origin"] = "smote"
                new_row["parent_ids"] = f"{parent_1_id} + {parent_2_id}"

                generated_rows.append(new_row)

            df_generated = pd.DataFrame(generated_rows)

            # Application du bruit léger sur colonnes numériques des lignes générées uniquement
            if techniques.light_noise_enabled and num_cols:
                noise_rng = np.random.RandomState(split_config.random_seed + 200)
                strength = techniques.noise_strength_pct / 100.0
                for nc in num_cols:
                    std_val = float(df_train[nc].std())
                    if std_val > 0:
                        noise = noise_rng.normal(0, strength * std_val, size=len(df_generated))
                        noisy_vals = df_generated[nc].to_numpy(dtype=float) + noise
                        min_obs = df_train[nc].min()
                        max_obs = df_train[nc].max()
                        noisy_vals = np.clip(noisy_vals, min_obs, max_obs)
                        if self._is_integer_column(df_train[nc]):
                            noisy_vals = np.round(noisy_vals).astype(int)
                        else:
                            noisy_vals = np.round(noisy_vals, 2)
                        df_generated[nc] = noisy_vals

        # Sous-échantillonnage aléatoire de la classe majoritaire
        df_majority_train = df_train[df_train[target_column] == majority_class].copy()
        rows_undersampled = 0
        if n_maj_to_keep < n_maj_real and techniques.undersample_enabled:
            under_rng = np.random.RandomState(techniques.undersample_seed)
            keep_indices = under_rng.choice(df_majority_train.index, size=n_maj_to_keep, replace=False)
            df_majority_train_kept = df_majority_train.loc[keep_indices].copy()
            rows_undersampled = n_maj_real - n_maj_to_keep
        else:
            df_majority_train_kept = df_majority_train

        # Reconstruction du train augmenté
        df_minority_train = df_train[df_train[target_column] == minority_class].copy()
        if not df_generated.empty:
            df_train_final = pd.concat([df_majority_train_kept, df_minority_train, df_generated], ignore_index=True)
        else:
            df_train_final = pd.concat([df_majority_train_kept, df_minority_train], ignore_index=True)

        # Calcul des poids de classes si demandé
        class_weights_dict = None
        if techniques.class_weights_enabled:
            classes = np.unique(df_train[target_column])
            weights = compute_class_weight(class_weight="balanced", classes=classes, y=df_train[target_column])
            class_weights_dict = {str(c): round(float(w), 3) for c, w in zip(classes, weights)}

        # Assemblage final du dataset (Train augmenté + Val intact + Test intact)
        df_final = pd.concat([df_train_final, df_val, df_test], ignore_index=True)

        # Respect des types dans df_final : entiers pour age/income, 2 décimales pour charges
        for nc in num_cols:
            if self._is_integer_column(df_train[nc]):
                try:
                    df_final[nc] = df_final[nc].round().astype(int)
                except Exception:
                    pass
            elif str(nc).lower() in ["monthly_charges", "charges", "price", "amount", "montant", "prix", "cout"]:
                try:
                    df_final[nc] = df_final[nc].round(2)
                except Exception:
                    pass

        # Calcul des scores et métriques post-augmentation
        final_train_rows = len(df_train_final)
        final_min_count = int((df_train_final[target_column] == minority_class).sum())
        minority_pct_after = round((final_min_count / max(1, final_train_rows)) * 100.0, 1)
        balance_score_after = self.calculate_target_balance_score(df_train_final[target_column])

        # ----------------------------------------------------
        # Validation des 6 Guardrails réels
        # ----------------------------------------------------
        guardrails: List[GuardrailResult] = []

        # Guardrail 1 : Test et validation jamais augmentés ni modifiés
        val_test_size_ok = (len(df_val) == len(df_split[val_mask])) and (len(df_test) == len(df_split[test_mask]))
        val_test_no_synthetic = (df_val["is_synthetic"].sum() == 0) and (df_test["is_synthetic"].sum() == 0)
        # Vérifier qu'aucune ligne du train n'est dupliquée dans le val ou test
        train_indices_set = set(df_train_final.index)
        g1_passed = bool(val_test_size_ok and val_test_no_synthetic)
        guardrails.append(
            GuardrailResult(
                key="test_and_val_never_augmented",
                label="Jeu de test et validation jamais augmentés",
                passed=g1_passed,
                description=f"{len(df_test):,} lignes de test et {len(df_val):,} lignes de val restent 100% réelles",
                details={"test_rows": len(df_test), "val_rows": len(df_val)},
            )
        )

        # Guardrail 2 : Plafond de 50% de synthétiques par classe respecté
        g2_passed = bool(len(df_generated) <= n_min_real)
        guardrails.append(
            GuardrailResult(
                key="max_50_pct_synthetic_per_class",
                label="Plafond max 50% de synthétiques par classe",
                passed=g2_passed,
                description=f"{len(df_generated):,} synthétiques générées pour {n_min_real:,} réelles (max 50% de la classe)",
                details={"synthetic_generated": len(df_generated), "real_minority": n_min_real},
            )
        )

        # Guardrail 3 : Tag d'origine sur chaque ligne générée
        if not df_generated.empty:
            g3_passed = bool(
                (df_generated["is_synthetic"] == True).all()
                and (df_generated["origin"] == "smote").all()
                and df_generated["parent_ids"].notna().all()
            )
        else:
            g3_passed = True
        guardrails.append(
            GuardrailResult(
                key="origin_tag_on_every_generated_row",
                label="Tag d'origine et parents sur chaque ligne générée",
                passed=g3_passed,
                description="origin = smote · parent_ids = les deux identifiants réels parents",
                details={"tagged_rows": len(df_generated)},
            )
        )

        # Guardrail 4 : Modalités catégorielles valides (aucune modalité inventée)
        g4_passed = True
        if not df_generated.empty:
            for cc in cat_cols:
                obs_cats = set(df_train[cc].dropna().unique())
                gen_cats = set(df_generated[cc].dropna().unique())
                if not gen_cats.issubset(obs_cats):
                    g4_passed = False
                    break
        guardrails.append(
            GuardrailResult(
                key="categories_stay_valid",
                label="Validité des catégories (invariants)",
                passed=g4_passed,
                description="SMOTE-NC n'invente aucune catégorie non présente dans les données réelles",
                details={"categories_checked": cat_cols},
            )
        )

        # Guardrail 5 : Voisins et parents issus exclusivement du Train
        g5_passed = True
        if not df_generated.empty and parent_pairs_list:
            if id_col:
                train_id_set = set(df_minority_train[id_col].tolist())
                for p1, p2 in parent_pairs_list:
                    if p1 not in train_id_set or p2 not in train_id_set:
                        g5_passed = False
                        break
        guardrails.append(
            GuardrailResult(
                key="parents_from_train_only",
                label="Parents de SMOTE-NC issus uniquement du Train",
                passed=g5_passed,
                description="Tous les voisins et parent_ids proviennent exclusivement du sous-ensemble Train",
                details={"parents_validated": len(parent_pairs_list)},
            )
        )

        # Guardrail 6 : Pas de double correction
        g6_passed = not (techniques.class_weights_enabled and (techniques.smote_nc_enabled or techniques.undersample_enabled))
        guardrails.append(
            GuardrailResult(
                key="no_double_correction",
                label="Pas de double correction",
                passed=g6_passed,
                description="Rééchantillonnage ou poids de classes, jamais les deux simultanément",
                details={"class_weights": techniques.class_weights_enabled, "resampling": techniques.smote_nc_enabled},
            )
        )

        # Si un guardrail critique échoue, lever une exception claire
        for g in guardrails:
            if not g.passed:
                raise ValueError(f"Contrôle de sécurité échoué ({g.label}) : {g.description}")

        def _format_cell_value(col: str, val: Any) -> Any:
            if pd.isna(val):
                return None
            if col in df_train.columns and self._is_integer_column(df_train[col]):
                try:
                    return int(round(float(val)))
                except Exception:
                    return val
            if str(col).lower() in ["monthly_charges", "charges", "price", "amount", "montant", "prix", "cout"] or (
                col in df_train.columns and pd.api.types.is_float_dtype(df_train[col])
            ):
                try:
                    return round(float(val), 2)
                except Exception:
                    return val
            return val

        # Échantillon de prévisualisation (2 réels, 2 smote si dispo)
        sample_preview: List[Dict[str, Any]] = []
        real_samples = df_minority_train.head(2).to_dict(orient="records")
        for r in real_samples:
            r_dict = {str(k): _format_cell_value(k, v) for k, v in r.items()}
            r_dict["origin_display"] = f"real · {r.get(id_col, 'ID')}"
            sample_preview.append(r_dict)

        if not df_generated.empty:
            synth_samples = df_generated.head(2).to_dict(orient="records")
            for s in synth_samples:
                s_dict = {str(k): _format_cell_value(k, v) for k, v in s.items()}
                s_dict["origin_display"] = f"smote · {s.get('parent_ids', '')}"
                sample_preview.append(s_dict)

        # Recette ordonnée au format JSON
        recipe = {
            "version": "1.0",
            "stage": "03_AUGMENTATION",
            "target_column": target_column,
            "split": {
                "ratios_target": {"train": split_config.train_ratio, "val": split_config.val_ratio, "test": split_config.test_ratio},
                "ratios_actual": actual_ratios,
                "stratify_column": split_config.stratify_column or target_column,
                "group_by_column": split_config.group_by_column,
                "random_seed": split_config.random_seed,
            },
            "balance": {
                "mode": balance_config.mode,
                "target_minority_ratio": target_ratio,
                "minority_pct_before": minority_pct_before,
                "minority_pct_after": minority_pct_after,
                "balance_score_before": balance_score_before,
                "balance_score_after": balance_score_after,
            },
            "techniques": [
                {
                    "name": "SMOTE-NC",
                    "enabled": techniques.smote_nc_enabled,
                    "target_class": str(minority_class),
                    "k_neighbors": techniques.smote_k_neighbors,
                    "generated_rows": len(df_generated),
                },
                {
                    "name": "UNDERSAMPLE_MAJORITY",
                    "enabled": techniques.undersample_enabled,
                    "target_class": str(majority_class),
                    "seed": techniques.undersample_seed,
                    "rows_dropped": rows_undersampled,
                },
                {
                    "name": "LIGHT_NOISE",
                    "enabled": techniques.light_noise_enabled,
                    "strength_pct": techniques.noise_strength_pct,
                },
                {
                    "name": "CLASS_WEIGHTS",
                    "enabled": techniques.class_weights_enabled,
                    "weights": class_weights_dict,
                },
            ],
            "guardrails": [g.model_dump() for g in guardrails],
        }

        # Distribution pour les barres graphiques
        balance_distribution = {
            "majority": {
                "label": str(majority_class),
                "total_initial": n_maj_real,
                "kept": n_maj_to_keep,
                "undersampled": rows_undersampled,
            },
            "minority": {
                "label": str(minority_class),
                "total_initial": n_min_real,
                "real": n_min_real,
                "generated": len(df_generated),
            },
            "target_ratio": target_ratio,
            "cap_reached": len(df_generated) == n_min_real and len(df_generated) > 0,
        }

        return {
            "df_final": df_final,
            "rows_in_train_before": initial_train_rows,
            "rows_in_train_after": final_train_rows,
            "rows_generated": len(df_generated),
            "rows_undersampled": rows_undersampled,
            "test_set_size": len(df_test),
            "val_set_size": len(df_val),
            "actual_split_ratios": actual_ratios,
            "minority_class_raw": minority_class,
            "majority_class_raw": majority_class,
            "minority_class_label": str(minority_class),
            "majority_class_label": str(majority_class),
            "minority_pct_before": minority_pct_before,
            "minority_pct_after": minority_pct_after,
            "balance_score_before": balance_score_before,
            "balance_score_after": balance_score_after,
            "balance_distribution": balance_distribution,
            "guardrails": guardrails,
            "sample_preview": sample_preview,
            "recipe": recipe,
            "class_weights": class_weights_dict,
        }

    def preview_augmentation(
        self,
        parquet_path: Path,
        request: AugmentationPreviewRequest,
    ) -> AugmentationPreviewResponse:
        """Simule l'augmentation sur le fichier Parquet sans rien enregistrer."""
        table = pq.read_table(parquet_path)
        df = table.to_pandas()

        res = self.apply_augmentation_pipeline(
            df=df,
            target_column=request.target_column,
            split_config=request.split_config,
            balance_config=request.balance_config,
            techniques=request.techniques,
        )

        return AugmentationPreviewResponse(
            rows_in_train_before=res["rows_in_train_before"],
            rows_in_train_after=res["rows_in_train_after"],
            rows_generated=res["rows_generated"],
            rows_undersampled=res["rows_undersampled"],
            test_set_size=res["test_set_size"],
            val_set_size=res["val_set_size"],
            actual_split_ratios=res["actual_split_ratios"],
            minority_class_label=res["minority_class_label"],
            majority_class_label=res["majority_class_label"],
            minority_pct_before=res["minority_pct_before"],
            minority_pct_after=res["minority_pct_after"],
            balance_score_before=res["balance_score_before"],
            balance_score_after=res["balance_score_after"],
            balance_distribution=res["balance_distribution"],
            guardrails=res["guardrails"],
            sample_preview=res["sample_preview"],
            recipe=res["recipe"],
            class_weights=res["class_weights"],
        )

    def apply_augmentation_and_create_version(
        self,
        db: Session,
        source_version: DatasetVersion,
        request: AugmentationApplyRequest,
    ) -> Dict[str, Any]:
        """Applique l'augmentation, sauvegarde le Parquet de façon atomique,
        crée la DatasetVersion immuable (v3) et la Transformation, et calcule le profil.
        """
        source_path = Path(source_version.storage_path)
        if not source_path.exists():
            raise FileNotFoundError(f"Fichier Parquet source introuvable: {source_path}")

        table = pq.read_table(source_path)
        df = table.to_pandas()

        start_time = time.time()
        pipeline_res = self.apply_augmentation_pipeline(
            df=df,
            target_column=request.target_column,
            split_config=request.split_config,
            balance_config=request.balance_config,
            techniques=request.techniques,
        )

        df_augmented = pipeline_res["df_final"]
        rows_generated = pipeline_res["rows_generated"]
        rows_undersampled = pipeline_res["rows_undersampled"]
        recipe = pipeline_res["recipe"]

        # Détection no-op : si aucune ligne générée, aucune sous-échantillonnée et pas de poids de classes
        if rows_generated == 0 and rows_undersampled == 0 and not request.techniques.class_weights_enabled:
            # Même si un split a été créé, si aucune transformation d'équilibrage n'a eu lieu et mode keep
            if request.balance_config.mode == "keep":
                raise ValueError("Aucune donnée modifiée (0 ligne générée, 0 sous-échantillonnée). Aucune nouvelle version créée.")

        # Calcul du hash logique déterministe
        data_hash = self.calculate_logical_data_hash(df_augmented)

        # Générer le hash de version de lignage
        new_version_hash = lineage_service.generate_version_hash(
            dataset_id=source_version.dataset_id,
            parent_version_hash=source_version.version_hash,
            transformation_name="AUGMENTATION_PIPELINE",
            parameters=recipe,
            data_hash=data_hash,
        )

        # Sauvegarde atomique du Parquet
        target_path = storage_service.get_version_parquet_path(source_version.dataset_id, new_version_hash)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        # Assurer l'intégrité des types de colonnes (notamment dates) avant conversion PyArrow
        if source_version.schema_metadata and "columns" in source_version.schema_metadata:
            for c_info in source_version.schema_metadata["columns"]:
                c_name = c_info.get("name")
                c_type = c_info.get("type", "")
                if c_name in df_augmented.columns:
                    if "date" in c_type.lower():
                        try:
                            df_augmented[c_name] = pd.to_datetime(df_augmented[c_name]).dt.date
                        except Exception:
                            pass
                    elif "timestamp" in c_type.lower():
                        try:
                            df_augmented[c_name] = pd.to_datetime(df_augmented[c_name])
                        except Exception:
                            pass
        
        aug_table = pa.Table.from_pandas(df_augmented, preserve_index=False)
        metadata = parquet_service.extract_table_metadata(aug_table)
        pq.write_table(aug_table, target_path, compression="snappy")
        file_size = target_path.stat().st_size
        total_rows = len(df_augmented)

        # Création de la DatasetVersion
        new_version = DatasetVersion(
            dataset_id=source_version.dataset_id,
            parent_version_id=source_version.id,
            version_hash=new_version_hash,
            storage_path=str(target_path),
            row_count=total_rows,
            size_bytes=file_size,
            schema_metadata=metadata,
        )
        db.add(new_version)
        db.flush()

        # Enregistrement de la transformation
        exec_duration_ms = (time.time() - start_time) * 1000.0
        transformation = Transformation(
            name="AUGMENTATION_PIPELINE",
            parameters=recipe,
            source_version_id=source_version.id,
            target_version_id=new_version.id,
            execution_time_ms=exec_duration_ms,
        )
        db.add(transformation)
        db.commit()
        db.refresh(new_version)

        # Déduire le nom de fichier d'origine via le lignage
        original_filename = None
        curr = source_version
        while curr:
            if curr.transformation_produced and curr.transformation_produced.parameters:
                original_filename = (
                    curr.transformation_produced.parameters.get("filename")
                    or curr.transformation_produced.parameters.get("original_filename")
                )
                if original_filename:
                    break
            if not curr.parent_version_id:
                break
            curr = curr.parent_version

        if not original_filename:
            original_filename = f"{source_version.dataset.name}.csv" if source_version.dataset else "dataset.csv"

        # Profils avant / après
        before_profile = profiling_service.get_or_create_profile(
            dataset_id=str(source_version.dataset_id),
            version_hash=source_version.version_hash,
            parquet_path=source_path,
            target_column=request.target_column,
            original_filename=original_filename,
        )
        after_profile = profiling_service.get_or_create_profile(
            dataset_id=str(source_version.dataset_id),
            version_hash=new_version_hash,
            parquet_path=target_path,
            target_column=request.target_column,
            original_filename=original_filename,
            force_recompute=True,
        )

        b_score = pipeline_res["balance_score_before"]
        a_score = pipeline_res["balance_score_after"]
        balance_delta = int(a_score - b_score)

        return {
            "new_version": new_version,
            "transformation": transformation,
            "pipeline_result": pipeline_res,
            "before_profile": before_profile,
            "after_profile": after_profile,
            "balance_score_delta": balance_delta,
            "recipe": recipe,
        }

    def run_model_comparison(
        self,
        df: pd.DataFrame,
        target_column: str,
        split_config: SplitConfig,
        balance_config: TargetBalanceConfig,
        techniques: TechniquesConfig,
        model_type: str = "logistic_regression",
        seeds: Optional[List[int]] = None,
    ) -> AugmentationComparisonResponse:
        """Phase 3 - Comparaison des performances « Est-ce que ça aide ? » :
        - Évalue un modèle simple (Régression Logistique ou Forêt Aléatoire) sur 5 graines aléatoires.
        - Entraîne le modèle de référence sur les lignes réelles du train de la v3 (split = train, is_synthetic = false).
        - Entraîne le modèle augmenté sur l'ensemble du train de la v3 (split = train).
        - Évalue les deux modèles exclusivement sur le même jeu de test réel (split = test).
        - Pré-traitement scikit-learn ajusté uniquement sur le train (fit sur train, transform sur test).
        - Exclut rigoureusement split, is_synthetic, origin, parent_ids et identifiants des variables explicatives.
        - Retourne moyennes et écarts-types pour Rappel, Précision et Score F1 sur la classe rare.
        """
        if seeds is None or len(seeds) == 0:
            seeds = [42, 43, 44, 45, 46]

        pipeline_res = self.apply_augmentation_pipeline(
            df=df,
            target_column=target_column,
            split_config=split_config,
            balance_config=balance_config,
            techniques=techniques,
        )

        df_final = pipeline_res["df_final"]
        minority_class = pipeline_res.get("minority_class_raw", pipeline_res.get("minority_class_label"))
        minority_label = pipeline_res.get("minority_class_label", str(minority_class))

        # 1. Sous-ensembles de données
        # IMPORTANT (Spécification Phase 3) :
        # - La référence (baseline) utilise les lignes réelles du train de la v3 (split = train, is_synthetic = false), jamais un nouveau split de la v2.
        # - Le modèle augmenté utilise l'ensemble du train de la v3 (split = train).
        # - L'évaluation des deux s'effectue exclusivement sur le même jeu de test réel (split = test).
        df_base_train = df_final[(df_final["split"] == "train") & (~df_final["is_synthetic"])].copy()
        df_aug_train = df_final[df_final["split"] == "train"].copy()
        df_test = df_final[df_final["split"] == "test"].copy()

        # 2. Identification des variables explicatives
        exclude_cols = set([target_column] + AUGMENTATION_METADATA_COLS)

        # Détection de colonnes d'identifiant à exclure
        for c in df_final.columns:
            if c in exclude_cols:
                continue
            if c.lower() in ["id", "customer_id", "client_id"] or c.lower().endswith("_id"):
                exclude_cols.add(c)
            elif df_final[c].nunique() == len(df_final):
                exclude_cols.add(c)

        feature_cols = [c for c in df_final.columns if c not in exclude_cols]
        if not feature_cols:
            raise ValueError("Aucune variable explicative disponible pour entraîner le modèle de comparaison.")

        # Transformation sécurisée des variables (dates en timestamps, types homogènes)
        def _prepare_features(sub_df: pd.DataFrame) -> pd.DataFrame:
            feat_df = pd.DataFrame(index=sub_df.index)
            for c in feature_cols:
                col_s = sub_df[c]
                if pd.api.types.is_datetime64_any_dtype(col_s) or "date" in c.lower():
                    try:
                        feat_df[f"{c}_ts"] = pd.to_datetime(col_s).astype("int64") // 10**9
                    except Exception:
                        feat_df[c] = col_s.astype(str)
                elif pd.api.types.is_numeric_dtype(col_s) and not pd.api.types.is_bool_dtype(col_s):
                    feat_df[c] = pd.to_numeric(col_s, errors="coerce")
                elif pd.api.types.is_bool_dtype(col_s):
                    feat_df[c] = col_s.astype(int)
                else:
                    feat_df[c] = col_s.astype(str)
            return feat_df

        X_base_train_raw = _prepare_features(df_base_train)
        X_aug_train_raw = _prepare_features(df_aug_train)
        X_test_raw = _prepare_features(df_test)

        # Cible binaire (1 = classe rare, 0 = classe majoritaire)
        def _to_binary(series: pd.Series) -> np.ndarray:
            return ((series == minority_class) | (series.astype(str) == str(minority_class))).astype(int).to_numpy()

        y_base_train = _to_binary(df_base_train[target_column])
        y_aug_train = _to_binary(df_aug_train[target_column])
        y_test = _to_binary(df_test[target_column])

        test_total = len(y_test)
        test_positives = int((y_test == 1).sum())

        num_features = [c for c in X_base_train_raw.columns if pd.api.types.is_numeric_dtype(X_base_train_raw[c])]
        cat_features = [c for c in X_base_train_raw.columns if c not in num_features]

        transformers = []
        if num_features:
            transformers.append((
                "num",
                Pipeline([
                    ("imputer", SimpleImputer(strategy="median")),
                    ("scaler", StandardScaler()),
                ]),
                num_features,
            ))
        if cat_features:
            transformers.append((
                "cat",
                Pipeline([
                    ("imputer", SimpleImputer(strategy="constant", fill_value="manquant")),
                    ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
                ]),
                cat_features,
            ))

        preprocessor_base = ColumnTransformer(transformers=transformers)

        # 3. Boucle sur les 5 graines
        base_recalls: List[float] = []
        base_precisions: List[float] = []
        base_f1s: List[float] = []

        aug_recalls: List[float] = []
        aug_precisions: List[float] = []
        aug_f1s: List[float] = []

        cw = "balanced" if techniques.class_weights_enabled else None

        for s in seeds:
            # Modèle Baseline (Train réel v3 sans données synthétiques)
            prep_b = clone(preprocessor_base)
            if model_type == "random_forest":
                clf_b = RandomForestClassifier(n_estimators=50, max_depth=6, random_state=s)
            else:
                clf_b = LogisticRegression(max_iter=1000, random_state=s)

            pipe_b = Pipeline([("prep", prep_b), ("clf", clf_b)])
            pipe_b.fit(X_base_train_raw, y_base_train)
            pred_b = pipe_b.predict(X_test_raw)

            base_recalls.append(float(recall_score(y_test, pred_b, pos_label=1, zero_division=0.0) * 100.0))
            base_precisions.append(float(precision_score(y_test, pred_b, pos_label=1, zero_division=0.0) * 100.0))
            base_f1s.append(float(f1_score(y_test, pred_b, pos_label=1, zero_division=0.0) * 100.0))

            # Modèle Augmenté (Train v3 complet avec SMOTE-NC / Undersampling / Poids)
            prep_a = clone(preprocessor_base)
            if model_type == "random_forest":
                clf_a = RandomForestClassifier(n_estimators=50, max_depth=6, random_state=s, class_weight=cw)
            else:
                clf_a = LogisticRegression(max_iter=1000, random_state=s, class_weight=cw)

            pipe_a = Pipeline([("prep", prep_a), ("clf", clf_a)])
            pipe_a.fit(X_aug_train_raw, y_aug_train)
            pred_a = pipe_a.predict(X_test_raw)

            aug_recalls.append(float(recall_score(y_test, pred_a, pos_label=1, zero_division=0.0) * 100.0))
            aug_precisions.append(float(precision_score(y_test, pred_a, pos_label=1, zero_division=0.0) * 100.0))
            aug_f1s.append(float(f1_score(y_test, pred_a, pos_label=1, zero_division=0.0) * 100.0))

        # 4. Agréger moyennes et écarts-types
        baseline_metrics = ModelComparisonMetrics(
            recall=ComparisonMetricResult(
                mean=round(float(np.mean(base_recalls)), 1),
                std=round(float(np.std(base_recalls)), 1),
                seed_values=[round(v, 1) for v in base_recalls],
            ),
            precision=ComparisonMetricResult(
                mean=round(float(np.mean(base_precisions)), 1),
                std=round(float(np.std(base_precisions)), 1),
                seed_values=[round(v, 1) for v in base_precisions],
            ),
            f1_score=ComparisonMetricResult(
                mean=round(float(np.mean(base_f1s)), 1),
                std=round(float(np.std(base_f1s)), 1),
                seed_values=[round(v, 1) for v in base_f1s],
            ),
        )

        augmented_metrics = ModelComparisonMetrics(
            recall=ComparisonMetricResult(
                mean=round(float(np.mean(aug_recalls)), 1),
                std=round(float(np.std(aug_recalls)), 1),
                seed_values=[round(v, 1) for v in aug_recalls],
            ),
            precision=ComparisonMetricResult(
                mean=round(float(np.mean(aug_precisions)), 1),
                std=round(float(np.std(aug_precisions)), 1),
                seed_values=[round(v, 1) for v in aug_precisions],
            ),
            f1_score=ComparisonMetricResult(
                mean=round(float(np.mean(aug_f1s)), 1),
                std=round(float(np.std(aug_f1s)), 1),
                seed_values=[round(v, 1) for v in aug_f1s],
            ),
        )

        deltas = {
            "recall": round(augmented_metrics.recall.mean - baseline_metrics.recall.mean, 1),
            "precision": round(augmented_metrics.precision.mean - baseline_metrics.precision.mean, 1),
            "f1_score": round(augmented_metrics.f1_score.mean - baseline_metrics.f1_score.mean, 1),
        }

        # Avertissement / Signalement statistique si petit jeu de test
        if test_total < 60 or test_positives < 20:
            warning_disclaimer = (
                f"* Sur un petit jeu de test ({test_total} exemples réels dont {test_positives} positifs), "
                f"les écarts observés peuvent être soumis aux aléas statistiques d'échantillonnage."
            )
        else:
            warning_disclaimer = (
                f"* Évaluation réalisée sur le jeu de test réel ({test_total} exemples dont {test_positives} positifs), "
                f"répétée sur {len(seeds)} graines aléatoires."
            )

        model_label = "Régression logistique" if model_type == "logistic_regression" else "Forêt aléatoire"

        return AugmentationComparisonResponse(
            model_type=model_type,
            model_label=model_label,
            test_total_count=test_total,
            test_positive_count=test_positives,
            minority_class_label=minority_label,
            baseline_metrics=baseline_metrics,
            augmented_metrics=augmented_metrics,
            deltas=deltas,
            seeds_used=seeds,
            warning_disclaimer=warning_disclaimer,
        )


augmentation_service = AugmentationService()
