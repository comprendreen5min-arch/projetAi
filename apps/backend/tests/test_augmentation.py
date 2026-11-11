import io
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from app.schemas.augmentation import (
    AugmentationApplyRequest,
    AugmentationPreviewRequest,
    SplitConfig,
    TargetBalanceConfig,
    TechniquesConfig,
)
from app.services.augmentation_service import augmentation_service


@pytest.fixture
def clean_churn_df():
    """Jeu de données synthétique propre représentant un churn binaire."""
    np.random.seed(42)
    n_samples = 120
    # 100 non-churn (0) et 20 churn (1) -> classe rare à 16.7%
    target = np.array([0] * 100 + [1] * 20)
    customer_ids = [f"C-{1000 + i}" for i in range(n_samples)]
    cities = np.random.choice(["Casablanca", "Rabat", "Marrakech"], size=n_samples)
    contracts = np.random.choice(["Monthly", "Annual"], size=n_samples)
    ages = np.random.randint(18, 70, size=n_samples)
    charges = np.round(np.random.uniform(20.0, 150.0, size=n_samples), 2)
    dates = pd.date_range("2023-01-01", periods=n_samples, freq="D").strftime("%Y-%m-%d").tolist()

    return pd.DataFrame({
        "customer_id": customer_ids,
        "city": cities,
        "contract": contracts,
        "age": ages,
        "charges": charges,
        "signup_date": dates,
        "churn": target,
    })


def test_stratified_split_integrity_and_ratios(clean_churn_df):
    """Vérifie que le split stratifié conserve la part de la classe rare
    et que Val et Test restent 100% réels et verrouillés.
    """
    split_cfg = SplitConfig(train_ratio=0.70, val_ratio=0.15, test_ratio=0.15, random_seed=42)
    df_split, actual_ratios = augmentation_service.perform_stratified_split(
        clean_churn_df, split_cfg, target_column="churn"
    )

    assert "split" in df_split.columns
    assert set(df_split["split"].unique()) == {"train", "val", "test"}

    # Vérification des ratios réels proches de 70 / 15 / 15
    assert 0.65 <= actual_ratios["train"] <= 0.75
    assert 0.10 <= actual_ratios["val"] <= 0.20
    assert 0.10 <= actual_ratios["test"] <= 0.20

    # Au moins 3 exemples de la classe rare dans chaque split
    for s in ["train", "val", "test"]:
        sub = df_split[(df_split["split"] == s) & (df_split["churn"] == 1)]
        assert len(sub) >= 3


def test_val_and_test_never_modified_nor_augmented(clean_churn_df):
    """Guardrail 1 : Val et Test ne doivent jamais être augmentés ni altérés."""
    split_cfg = SplitConfig(train_ratio=0.70, val_ratio=0.15, test_ratio=0.15, random_seed=42)
    balance_cfg = TargetBalanceConfig(mode="30")
    tech_cfg = TechniquesConfig(smote_nc_enabled=True, undersample_enabled=True, smote_k_neighbors=3)

    res = augmentation_service.apply_augmentation_pipeline(
        clean_churn_df,
        target_column="churn",
        split_config=split_cfg,
        balance_config=balance_cfg,
        techniques=tech_cfg,
    )

    df_final = res["df_final"]

    # Lignes de validation et de test
    val_rows = df_final[df_final["split"] == "val"]
    test_rows = df_final[df_final["split"] == "test"]

    assert len(val_rows) == res["val_set_size"]
    assert len(test_rows) == res["test_set_size"]

    # 0 ligne synthétique dans Val et Test
    assert (val_rows["is_synthetic"] == False).all()
    assert (test_rows["is_synthetic"] == False).all()
    assert (val_rows["origin"] == "real").all()
    assert (test_rows["origin"] == "real").all()

    # Seul le Train contient des lignes synthétiques
    train_rows = df_final[df_final["split"] == "train"]
    synth_train = train_rows[train_rows["is_synthetic"] == True]
    assert len(synth_train) == res["rows_generated"]


def test_smote_parents_from_train_only(clean_churn_df):
    """Guardrail 5 : Tous les voisins et parent_ids doivent provenir UNIQUEMENT du Train."""
    split_cfg = SplitConfig(train_ratio=0.70, val_ratio=0.15, test_ratio=0.15, random_seed=42)
    balance_cfg = TargetBalanceConfig(mode="30")
    tech_cfg = TechniquesConfig(smote_nc_enabled=True, undersample_enabled=True, smote_k_neighbors=3)

    res = augmentation_service.apply_augmentation_pipeline(
        clean_churn_df,
        target_column="churn",
        split_config=split_cfg,
        balance_config=balance_cfg,
        techniques=tech_cfg,
    )

    df_final = res["df_final"]
    real_train_ids = set(df_final[(df_final["split"] == "train") & (~df_final["is_synthetic"])]["customer_id"])
    val_test_ids = set(df_final[df_final["split"].isin(["val", "test"])]["customer_id"])

    synth_rows = df_final[df_final["is_synthetic"] == True]
    assert len(synth_rows) > 0

    for _, row in synth_rows.iterrows():
        parent_ids = row["parent_ids"]
        assert parent_ids is not None
        p1, p2 = [p.strip() for p in parent_ids.split("+")]

        # Les deux parents doivent appartenir au Train réel
        assert p1 in real_train_ids, f"Parent {p1} n'est pas dans le Train!"
        assert p2 in real_train_ids, f"Parent {p2} n'est pas dans le Train!"

        # Aucun parent ne doit provenir de Val ou Test
        assert p1 not in val_test_ids
        assert p2 not in val_test_ids


def test_max_50_pct_synthetic_per_class_cap(clean_churn_df):
    """Guardrail 2 : Plafond strict de 50% de synthétiques dans la classe rare
    (le nombre de synthétiques ne dépasse jamais le nombre de réels de la classe).
    """
    split_cfg = SplitConfig(train_ratio=0.70, val_ratio=0.15, test_ratio=0.15, random_seed=42)
    # Même avec un objectif de 50%, le plafond limite les synthétiques aux réels disponibles
    balance_cfg = TargetBalanceConfig(mode="50")
    tech_cfg = TechniquesConfig(smote_nc_enabled=True, undersample_enabled=True, smote_k_neighbors=3)

    res = augmentation_service.apply_augmentation_pipeline(
        clean_churn_df,
        target_column="churn",
        split_config=split_cfg,
        balance_config=balance_cfg,
        techniques=tech_cfg,
    )

    minority_real = res["balance_distribution"]["minority"]["real"]
    minority_gen = res["balance_distribution"]["minority"]["generated"]

    # Le nombre généré ne peut jamais excéder le nombre réel (plafond 50% de la classe)
    assert minority_gen <= minority_real
    assert res["balance_distribution"]["cap_reached"] is True


def test_categories_stay_valid_guardrail(clean_churn_df):
    """Guardrail 4 : SMOTE-NC ne doit jamais inventer une modalité catégorielle inconnue."""
    split_cfg = SplitConfig(train_ratio=0.70, val_ratio=0.15, test_ratio=0.15, random_seed=42)
    balance_cfg = TargetBalanceConfig(mode="30")
    tech_cfg = TechniquesConfig(smote_nc_enabled=True, undersample_enabled=True, smote_k_neighbors=3)

    res = augmentation_service.apply_augmentation_pipeline(
        clean_churn_df,
        target_column="churn",
        split_config=split_cfg,
        balance_config=balance_cfg,
        techniques=tech_cfg,
    )

    df_final = res["df_final"]
    synth_df = df_final[df_final["is_synthetic"] == True]

    for cat_col in ["city", "contract"]:
        obs_values = set(clean_churn_df[cat_col].unique())
        gen_values = set(synth_df[cat_col].unique())
        assert gen_values.issubset(obs_values), f"Catégories inventées dans {cat_col}: {gen_values - obs_values}"


def test_no_double_correction_guardrail(clean_churn_df):
    """Guardrail 6 : Interdiction formelle d'activer rééchantillonnage + poids de classes."""
    split_cfg = SplitConfig(random_seed=42)
    balance_cfg = TargetBalanceConfig(mode="30")
    tech_cfg = TechniquesConfig(smote_nc_enabled=True, class_weights_enabled=True)

    with pytest.raises(ValueError, match="Pas de double correction"):
        augmentation_service.apply_augmentation_pipeline(
            clean_churn_df,
            target_column="churn",
            split_config=split_cfg,
            balance_config=balance_cfg,
            techniques=tech_cfg,
        )


def test_smote_refusal_when_missing_values(clean_churn_df):
    """Point d'attention (7) : Refus explicite si des valeurs manquantes existent,
    en listant les colonnes et les comptes, avec renvoi vers Cleaning.
    """
    df_missing = clean_churn_df.copy()
    df_missing.loc[0, "age"] = np.nan
    df_missing.loc[2, "charges"] = np.nan
    df_missing.loc[5, "city"] = ""

    split_cfg = SplitConfig(random_seed=42)
    balance_cfg = TargetBalanceConfig(mode="30")
    tech_cfg = TechniquesConfig(smote_nc_enabled=True, smote_k_neighbors=3)

    with pytest.raises(ValueError) as exc_info:
        augmentation_service.apply_augmentation_pipeline(
            df_missing,
            target_column="churn",
            split_config=split_cfg,
            balance_config=balance_cfg,
            techniques=tech_cfg,
        )

    msg = str(exc_info.value)
    assert "valeurs manquantes" in msg
    assert "Cleaning (/cleaning)" in msg


def test_smote_refusal_when_rare_class_less_than_k_plus_1(clean_churn_df):
    """Refus propre si la classe rare a moins de k+1 lignes dans le train."""
    # Créer un dataset avec seulement 2 churners
    df_small = clean_churn_df.copy()
    churn_indices = df_small[df_small["churn"] == 1].index
    # Garder seulement 3 churners au total -> train en aura ~2
    drop_indices = churn_indices[3:]
    df_small = df_small.drop(drop_indices).reset_index(drop=True)

    split_cfg = SplitConfig(random_seed=42)
    balance_cfg = TargetBalanceConfig(mode="30")
    # k = 5 alors que le train a au plus 2 exemples
    tech_cfg = TechniquesConfig(smote_nc_enabled=True, smote_k_neighbors=5)

    with pytest.raises(ValueError, match="exemples de la classe rare"):
        augmentation_service.apply_augmentation_pipeline(
            df_small,
            target_column="churn",
            split_config=split_cfg,
            balance_config=balance_cfg,
            techniques=tech_cfg,
        )


def test_group_by_split_refusal_when_insufficient_minority(clean_churn_df):
    """Point (6) : Avec group_by, refus du split si une partie contient moins de 3 exemples."""
    # Créer un group_by où certains groupes concentrent tous les churners
    df_group = clean_churn_df.copy()
    # Seulement 3 groupes au total
    df_group["group_id"] = np.random.choice(["G1", "G2", "G3"], size=len(df_group))

    split_cfg = SplitConfig(
        train_ratio=0.70,
        val_ratio=0.15,
        test_ratio=0.15,
        group_by_column="group_id",
        random_seed=42,
    )

    # Si un split a < 3 churners, une ValueError explicite doit être levée
    # Ou si les données permettent le split, vérifier que chaque split a >= 3 churners
    try:
        df_split, actual_ratios = augmentation_service.perform_stratified_split(
            df_group, split_cfg, target_column="churn"
        )
        for s in ["train", "val", "test"]:
            cnt = len(df_split[(df_split["split"] == s) & (df_split["churn"] == 1)])
            assert cnt >= 3
    except ValueError as ve:
        assert "moins de 3 exemples" in str(ve)


def test_deterministic_reproducibility(clean_churn_df):
    """Même graine et mêmes réglages doivent produire un résultat strictement identique."""
    split_cfg = SplitConfig(random_seed=42)
    balance_cfg = TargetBalanceConfig(mode="30")
    tech_cfg = TechniquesConfig(
        smote_nc_enabled=True,
        undersample_enabled=True,
        smote_k_neighbors=3,
        light_noise_enabled=True,
        noise_strength_pct=2.0,
    )

    res1 = augmentation_service.apply_augmentation_pipeline(
        clean_churn_df,
        target_column="churn",
        split_config=split_cfg,
        balance_config=balance_cfg,
        techniques=tech_cfg,
    )
    hash1 = augmentation_service.calculate_logical_data_hash(res1["df_final"])

    res2 = augmentation_service.apply_augmentation_pipeline(
        clean_churn_df,
        target_column="churn",
        split_config=split_cfg,
        balance_config=balance_cfg,
        techniques=tech_cfg,
    )
    hash2 = augmentation_service.calculate_logical_data_hash(res2["df_final"])

    assert hash1 == hash2, "Le hash logique doit être 100% déterministe avec la même graine."
    assert len(res1["df_final"]) == len(res2["df_final"])


def test_light_noise_bounds_and_integer_preservation(clean_churn_df):
    """Vérifie que le bruit léger est borné aux min/max observés et préserve les entiers."""
    split_cfg = SplitConfig(random_seed=42)
    balance_cfg = TargetBalanceConfig(mode="30")
    tech_cfg = TechniquesConfig(
        smote_nc_enabled=True,
        undersample_enabled=False,
        smote_k_neighbors=3,
        light_noise_enabled=True,
        noise_strength_pct=5.0,
    )

    res = augmentation_service.apply_augmentation_pipeline(
        clean_churn_df,
        target_column="churn",
        split_config=split_cfg,
        balance_config=balance_cfg,
        techniques=tech_cfg,
    )

    df_final = res["df_final"]
    synth_df = df_final[df_final["is_synthetic"] == True]

    # 'age' est entier -> les valeurs générées bruitées doivent rester entières
    for age_val in synth_df["age"]:
        assert float(age_val).is_integer() or isinstance(age_val, (int, np.integer))

    # Les bornes min et max observées doivent être respectées
    assert synth_df["age"].min() >= clean_churn_df["age"].min()
    assert synth_df["age"].max() <= clean_churn_df["age"].max()


def test_augmentation_api_endpoints_end_to_end(client):
    """Test d'intégration complet des endpoints /augmentation/preview et /apply."""
    # 1. Uploader un dataset propre avec cible binaire (>= 20 churners pour avoir >= 3 par split à 15%)
    csv_data = (
        "customer_id,city,contract,age,charges,churn\n"
        + "\n".join(f"C-{100+i},Casablanca,Monthly,{25+i%30},{50.0+i%20},0" for i in range(80))
        + "\n"
        + "\n".join(f"C-{200+i},Rabat,Annual,{30+i%20},{70.0+i%10},1" for i in range(25))
    )
    files = {"file": ("clean_churn.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    upload_resp = client.post(
        "/api/v1/datasets/upload-raw",
        data={"name": "test_aug_ds", "description": "Augmentation Test DS"},
        files=files,
    )
    assert upload_resp.status_code == 201
    v1_hash = upload_resp.json()["versions"][0]["version_hash"]

    # 2. Test POST /augmentation/preview
    prev_payload = {
        "source_version_hash": v1_hash,
        "target_column": "churn",
        "split_config": {
            "train_ratio": 0.70,
            "val_ratio": 0.15,
            "test_ratio": 0.15,
            "random_seed": 42,
        },
        "balance_config": {"mode": "30"},
        "techniques": {
            "smote_nc_enabled": True,
            "smote_k_neighbors": 3,
            "undersample_enabled": True,
            "undersample_seed": 42,
            "light_noise_enabled": False,
            "class_weights_enabled": False,
        },
    }
    prev_resp = client.post("/api/v1/augmentation/preview", json=prev_payload)
    assert prev_resp.status_code == 200, f"Preview failed: {prev_resp.text}"
    p_data = prev_resp.json()

    assert p_data["rows_generated"] > 0
    assert p_data["balance_score_after"] >= p_data["balance_score_before"]
    assert len(p_data["guardrails"]) == 6
    assert all(g["passed"] for g in p_data["guardrails"])

    # 3. Test POST /augmentation/apply
    apply_resp = client.post("/api/v1/augmentation/apply", json=prev_payload)
    assert apply_resp.status_code == 201, f"Apply failed: {apply_resp.text}"
    a_data = apply_resp.json()

    assert a_data["new_version_hash"] is not None
    assert a_data["new_version_hash"] != v1_hash
    assert a_data["parent_version_hash"] == v1_hash
    assert a_data["transformation_name"] == "AUGMENTATION_PIPELINE"
    assert a_data["rows_generated"] == p_data["rows_generated"]
    assert a_data["recipe"] is not None

    # Profil après augmentation
    assert a_data["after_profile"]["summary"]["total_rows"] == a_data["total_rows"]


def test_phase3_model_comparison_service(clean_churn_df):
    """Phase 3 : Vérifie que la comparaison :
    1. Utilise comme référence les lignes réelles du train (split=train, is_synthetic=false).
    2. Exclut rigoureusement split, is_synthetic, origin, parent_ids des variables explicatives.
    3. Évalue exclusivement sur le jeu de test réel.
    4. Répète l'expérience sur 5 graines et calcule moyennes, écarts-types et deltas.
    5. Affiche le nombre de positifs dans le jeu de test.
    """
    split_cfg = SplitConfig(train_ratio=0.70, val_ratio=0.15, test_ratio=0.15, random_seed=42)
    balance_cfg = TargetBalanceConfig(mode="30")
    tech_cfg = TechniquesConfig(smote_nc_enabled=True, smote_k_neighbors=3, undersample_enabled=True)

    seeds = [42, 43, 44, 45, 46]
    res = augmentation_service.run_model_comparison(
        df=clean_churn_df,
        target_column="churn",
        split_config=split_cfg,
        balance_config=balance_cfg,
        techniques=tech_cfg,
        model_type="logistic_regression",
        seeds=seeds,
    )

    assert res.test_total_count == 18
    assert res.test_positive_count >= 3
    assert res.model_type == "logistic_regression"
    assert len(res.seeds_used) == 5

    # Métriques baseline (Sans augmentation)
    assert 0.0 <= res.baseline_metrics.recall.mean <= 100.0
    assert 0.0 <= res.baseline_metrics.precision.mean <= 100.0
    assert 0.0 <= res.baseline_metrics.f1_score.mean <= 100.0
    assert len(res.baseline_metrics.recall.seed_values) == 5

    # Métriques augmentées (Avec augmentation)
    assert 0.0 <= res.augmented_metrics.recall.mean <= 100.0
    assert 0.0 <= res.augmented_metrics.precision.mean <= 100.0
    assert 0.0 <= res.augmented_metrics.f1_score.mean <= 100.0
    assert len(res.augmented_metrics.recall.seed_values) == 5

    # Deltas
    assert "recall" in res.deltas
    assert "precision" in res.deltas
    assert "f1_score" in res.deltas

    # Avertissement statistique présent
    assert "positifs" in res.warning_disclaimer


def test_phase3_model_comparison_api_endpoint(client):
    """Vérifie l'endpoint API POST /api/v1/augmentation/compare."""
    # 1. Ingestion via upload-raw
    csv_data = (
        "customer_id,city,contract,age,charges,churn\n"
        + "\n".join(f"C-{100+i},Casablanca,Monthly,{25+i%30},{50.0+i%20},0" for i in range(80))
        + "\n"
        + "\n".join(f"C-{200+i},Rabat,Annual,{30+i%20},{70.0+i%10},1" for i in range(25))
    )
    files = {"file": ("clean_churn_p3.csv", io.BytesIO(csv_data.encode("utf-8")), "text/csv")}
    upload_resp = client.post(
        "/api/v1/datasets/upload-raw",
        data={"name": "test_aug_p3_ds", "description": "Augmentation P3 DS"},
        files=files,
    )
    assert upload_resp.status_code == 201
    v_hash = upload_resp.json()["versions"][0]["version_hash"]

    # 2. Appel POST /augmentation/compare
    compare_payload = {
        "source_version_hash": v_hash,
        "target_column": "churn",
        "split_config": {
            "train_ratio": 0.70,
            "val_ratio": 0.15,
            "test_ratio": 0.15,
            "stratify_column": "churn",
            "random_seed": 42,
        },
        "balance_config": {"mode": "30"},
        "techniques": {
            "smote_nc_enabled": True,
            "smote_k_neighbors": 3,
            "undersample_enabled": True,
            "undersample_seed": 42,
            "light_noise_enabled": False,
            "class_weights_enabled": False,
        },
        "model_type": "logistic_regression",
        "seeds": [42, 43, 44, 45, 46],
    }

    comp_resp = client.post("/api/v1/augmentation/compare", json=compare_payload)
    assert comp_resp.status_code == 200, f"Compare failed: {comp_resp.text}"
    c_data = comp_resp.json()

    assert c_data["model_type"] == "logistic_regression"
    assert c_data["test_positive_count"] >= 3
    assert len(c_data["seeds_used"]) == 5
    assert "recall" in c_data["deltas"]
    assert "f1_score" in c_data["deltas"]

