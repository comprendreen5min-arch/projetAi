from pathlib import Path
import pytest
from sqlalchemy.orm import Session
from app.services.text_profiling_service import text_profiling_service


def test_text_profiling_on_test_texte(db_session: Session):
    """
    Test Text Profiling on test_texte.txt (214 lines total):
    - 205 valid documents
    - 9 empty or whitespace lines ignored
    - 10 exact duplicates
    - Expected languages: ~85% French, 8 English, 3-4 Spanish, 3 Arabic, undetermined for short texts
    - No labels / targets (no 'general' class invented, 'Aucune', no label balance subscore)
    - Real size in Ko (24 Ko)
    - PII email and corrupted encoding highlighted in quotes
    """
    test_file_path = Path(__file__).parent / "test_texte.txt"
    assert test_file_path.exists(), f"Fichier {test_file_path} introuvable"

    file_bytes = test_file_path.read_bytes()

    profile = text_profiling_service.upload_text_bytes(
        contents=file_bytes,
        filename="test_texte.txt",
        db=db_session,
        dataset_name="test_texte.txt",
    )

    # 1. Documents count: exactly 205
    docs_kpi = str(profile["kpis"]["documents"]).replace(" ", "").replace(",", "")
    assert docs_kpi == "205", f"Attendu 205 documents, obtenu: {docs_kpi}"

    # 2. Empty lines: exactly 9 lines ignored
    assert profile["kpis"].get("empty_lines_ignored") == 9, (
        f"Attendu 9 lignes vides ignorées, obtenu: {profile['kpis'].get('empty_lines_ignored')}"
    )

    # 3. File size: displayed in Ko (24 Ko)
    assert "Ko" in profile["kpis"]["size"], f"Taille attendue en Ko, obtenu: {profile['kpis']['size']}"
    assert profile["kpis"]["size"] == "24 Ko", f"Taille attendue 24 Ko, obtenu: {profile['kpis']['size']}"

    # 4. Labels: no label column, no 'general' class invented, 'Aucune'
    assert profile["labels"]["has_labels"] is False, "Le jeu de données ne doit pas avoir d'étiquettes"
    assert profile["labels"]["classes_count"] == 0, "Le nombre de classes doit être 0"
    assert profile["kpis"]["labels"] in [0, "0", "Aucune"], f"Label KPI inattendu: {profile['kpis']['labels']}"
    assert len(profile["labels"]["bars"]) == 0, "La liste des étiquettes doit être vide"

    # Health score subscores: label balance must be excluded (only 4 bars)
    health_bar_labels = [b["label"].lower() for b in profile["health"]["bars"]]
    assert not any("étiquette" in lbl or "label" in lbl for lbl in health_bar_labels), (
        "Le sous-score d'équilibre des étiquettes ne doit pas figurer dans le score de santé"
    )
    assert len(profile["health"]["bars"]) == 4, f"Attendu 4 barres de santé, obtenu: {len(profile['health']['bars'])}"

    # Findings: no label imbalance alert
    finding_titles = [f["title"].lower() for f in profile["findings"]]
    assert not any("étiquette" in t or "label" in t for t in finding_titles), (
        "Aucune alerte de déséquilibre des étiquettes ne doit être générée"
    )

    # 5. Duplicates: 10 exact duplicates, normalization rule displayed
    assert profile["duplicates"]["exact_count"] == 10, (
        f"Attendu 10 doublons exacts, obtenu: {profile['duplicates']['exact_count']}"
    )
    assert "normalization_rule" in profile["duplicates"]
    assert len(profile["duplicates"]["exact_groups"]) == 10, (
        f"Attendu 10 groupes de doublons, obtenu: {len(profile['duplicates']['exact_groups'])}"
    )

    # 6. Languages:
    # Expected: ~85% French, 8 English, 3 Spanish (4 occurrences), 3 Arabic, 0 mixed
    slices = {s["name"]: s for s in profile["languages"]["slices"]}

    assert "Français" in slices, "Le français doit être détecté"
    fr_pct = slices["Français"]["pct"]
    assert 80 <= fr_pct <= 90, f"Pourcentage de français attendu ~85%, obtenu: {fr_pct}%"

    assert "Anglais" in slices, "L'anglais doit être détecté"
    assert slices["Anglais"]["count"] == 8, f"Attendu exactement 8 textes anglais, obtenu: {slices['Anglais']['count']}"

    assert "Arabe" in slices, "L'arabe doit être détecté"
    assert slices["Arabe"]["count"] == 3, f"Attendu exactement 3 textes arabes, obtenu: {slices['Arabe']['count']}"

    assert "Espagnol" in slices, "L'espagnol doit être détecté"
    assert slices["Espagnol"]["count"] in [3, 4], f"Attendu 3 ou 4 textes espagnols, obtenu: {slices['Espagnol']['count']}"

    # Darija should NOT be invented
    assert "Darija" not in slices, "Darija ne doit pas être inventé si le détecteur ne le gère pas"

    # Mixed documents: 0 in this corpus
    assert "Aucun document mixte" in profile["languages"]["mixed_text"] or "0" in profile["languages"]["mixed_text"]

    # 7. Quotes:
    # Should highlight personal data (email / phone) and broken encoding
    quotes = profile["quotes"]
    tags = [q["tag"] for q in quotes]
    assert "DONNÉES PERSONNELLES" in tags, "Une citation avec données personnelles doit être présente"
    assert "ENCODAGE" in tags, "Une citation avec problème d'encodage doit être présente"
    assert not any("LABEL" in t or "ÉTIQUETTE" in t for t in tags), (
        "Aucune alerte LABEL MAY BE WRONG ne doit être présente pour des données sans étiquette"
    )

    # Email highlighting verification: sara.benali@exemple.com
    email_quotes = [q for q in quotes if "@" in q.get("marked", "")]
    assert len(email_quotes) >= 1, "L'adresse email (sara.benali@exemple.com) doit être surlignée dans les extraits"
    assert email_quotes[0]["marked"] == "sara.benali@exemple.com"

    # 8. Length histogram classes
    assert len(profile["length"]["histogram_details"]) > 0
    assert "mots" in profile["length"]["histogram_details"][0]["label"]
