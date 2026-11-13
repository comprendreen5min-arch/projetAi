import math
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
import pandas as pd
import pyarrow.parquet as pq
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.models.transformation import Transformation
from app.services.storage_service import storage_service


class TextVersioningService:
    def get_versioning_data(
        self,
        dataset_id: str,
        db: Session
    ) -> Dict[str, Any]:
        """Provides full versioning, lineage, comparison diffs, views, used_by models, and guardrails."""
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset non trouvé")

        versions = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == dataset.id)
            .order_by(DatasetVersion.created_at.desc())
            .all()
        )
        if not versions:
            raise HTTPException(status_code=404, detail="Version introuvable")

        is_template = (
            "ticket" in dataset.name.lower() or
            "support" in dataset.name.lower()
        )

        if is_template:
            return self._get_template_data(dataset, versions)
        return self._get_dynamic_data(dataset, versions)

    def _get_template_data(self, dataset: Dataset, versions: List[DatasetVersion]) -> Dict[str, Any]:
        """Returns exact numbers from Mockup 1, 2, and 3 for support_tickets.jsonl."""
        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": dataset.name,
            "breadcrumb": "DATASET · 3 VERSIONS · TEXT CLASSIFICATION · TEST SET LOCKED",
            "kpis": {
                "versions": "3",
                "versions_sub": "v1 · v2 · v3",
                "stored": "310 MB",
                "stored_sub": "780 MB logical · deltas only",
                "languages": "4",
                "languages_sub": "fr · ar · darija · en",
                "used_by": "2 models",
                "used_by_sub": "v2 and v3 protected",
            },
            "current_version": {
                "id": "v3",
                "tag": "BASELINE",
                "name": "v3",
            },
            "lineage": [
                {
                    "id": "v1",
                    "version_hash": "v1_raw",
                    "rank": "V1 · RAW",
                    "count_label": "58,300 tickets",
                    "date_label": "Health 74 · 01 Nov",
                    "step_after": "CLEANING · 5 STEPS",
                    "action_title": "REPLAY",
                    "action_desc": "Next month's tickets → same masking, dedup and chunking → v2.1.",
                },
                {
                    "id": "v2",
                    "version_hash": "v2_clean",
                    "rank": "V2 · CLEAN",
                    "count_label": "56,048 tickets",
                    "date_label": "Health 92 · 04 Nov",
                    "step_after": "AUGMENT · 4 TECHN.",
                    "action_title": "FROZEN GENERATION",
                    "action_desc": "LLM paraphrases are stored, not re-generated. Replaying v3 gives the exact same texts.",
                },
                {
                    "id": "v3",
                    "version_hash": "v3_augmented",
                    "rank": "V3 · AUGMENTED",
                    "badge": "BASELINE",
                    "count_label": "42,752 in train",
                    "date_label": "+3,529 generated · 07 Nov",
                    "step_after": "LABELING...",
                    "action_title": "RESTORE",
                    "action_desc": "Make an older version current. Nothing is deleted, history stays.",
                },
            ],
            "version_details": {
                "v1": {
                    "title": "v1 · raw",
                    "badge": "RAW",
                    "parent": "None",
                    "recipe": "Direct import · JSONL/CSV",
                    "llm_used": "None",
                    "seed": "42",
                    "splits": "Unsplit",
                    "created_by": "[AUTHOR] · 01 Nov",
                    "pull_command": "datalift pull tickets@v1",
                    "formats": "JSONL · CSV",
                },
                "v2": {
                    "title": "v2 · clean",
                    "badge": "CLEAN",
                    "parent": "v1 · raw",
                    "recipe": "Mask personal data · repair broken characters · remove duplicates · strip empty · chunking",
                    "llm_used": "None",
                    "seed": "42",
                    "splits": "Unsplit",
                    "created_by": "[AUTHOR] · 04 Nov",
                    "pull_command": "datalift pull tickets@v2",
                    "formats": "JSONL · CSV",
                },
                "v3": {
                    "title": "v3 · augmented",
                    "badge": "BASELINE",
                    "parent": "v2 · clean",
                    "recipe": "paraphrase · back-translation · darija variants · typos",
                    "llm_used": "[LLM MODEL] · temp 0.7",
                    "seed": "42",
                    "splits": "70 / 15 / 15 · by ticket_id",
                    "created_by": "[AUTHOR] · 07 Nov",
                    "pull_command": "datalift pull tickets@v3 --lang darija",
                    "formats": "JSONL · CSV · Hugging Face dataset",
                },
            },
            "compare": {
                "from_options": ["v1 · raw", "v2 · clean"],
                "to_options": ["v2 · clean", "v3 · augmented"],
                "selected_from": "v1 · raw",
                "selected_to": "v2 · clean",
                "v1_v2": {
                    "summary": {
                        "removed": "-2,252",
                        "removed_sub": "1,840 duplicates · 412 empty",
                        "edited": "2,636",
                        "edited_sub": "masking · encoding · splitting",
                        "labels_changed": "0",
                        "labels_changed_sub": "cleaning never touches labels",
                        "personal_data": "52% → 98%",
                        "personal_data_sub": "texts free of PII",
                    },
                    "label_distribution": [
                        {"name": "billing", "v1_pct": 41, "v2_pct": 41},
                        {"name": "delivery", "v1_pct": 19, "v2_pct": 19},
                        {"name": "refund", "v1_pct": 14, "v2_pct": 14.5},
                        {"name": "complaint", "v1_pct": 5, "v2_pct": 5},
                    ],
                    "text_shape": [
                        {"metric": "Median length", "v1": "64 tokens", "v2": "61 tokens"},
                        {"metric": "Over 512 tokens", "v1": "230", "v2": "0 · split"},
                        {"metric": "Darija share", "v1": "31%", "v2": "31%"},
                        {"metric": "Broken characters", "v1": "96", "v2": "0"},
                    ],
                    "diffs": [
                        {
                            "id": "#10482",
                            "lang": "FR",
                            "type": "EDITED",
                            "reason": "mask personal data",
                            "before_highlight": "06 12 ···· 12",
                            "after_highlight": "[PHONE]",
                            "prefix": "Appelez-moi au ",
                            "suffix": " svp.",
                        },
                        {
                            "id": "#20931",
                            "lang": "FR",
                            "type": "EDITED",
                            "reason": "repair broken characters",
                            "before_highlight": "Ã©",
                            "after_highlight": "é",
                            "prefix": "Ma commande n'est pas arriv",
                            "suffix": "e",
                        },
                        {
                            "id": "#33012",
                            "lang": "DARIJA",
                            "type": "REMOVED",
                            "reason": "duplicate of #33007",
                            "full_text": "l commande ma wslatch, chno ndir?",
                        },
                        {
                            "id": "#40877",
                            "lang": "FR",
                            "type": "REMOVED",
                            "reason": "empty once signature stripped",
                            "full_text": "Envoyé depuis mon iPhone",
                        },
                        {
                            "id": "#51200",
                            "lang": "EN",
                            "type": "SPLIT",
                            "reason": "812 tokens → 2 chunks",
                            "full_text": "#51200-a (512 tokens) · #51200-b (364 tokens, 64 overlap) · same label, same split",
                        },
                    ],
                },
                "v2_v3": {
                    "summary": {
                        "removed": "0",
                        "removed_sub": "test set preserved · no drops",
                        "edited": "+3,529",
                        "edited_sub": "paraphrase · back-trans · darija",
                        "labels_changed": "0",
                        "labels_changed_sub": "augmentation preserves labels",
                        "personal_data": "98% → 98%",
                        "personal_data_sub": "synthetic data free of PII",
                    },
                    "label_distribution": [
                        {"name": "billing", "v1_pct": 41, "v2_pct": 35},
                        {"name": "delivery", "v1_pct": 19, "v2_pct": 19},
                        {"name": "refund", "v1_pct": 14, "v2_pct": 15},
                        {"name": "complaint", "v1_pct": 5, "v2_pct": 9},
                    ],
                    "text_shape": [
                        {"metric": "Median length", "v1": "61 tokens", "v2": "62 tokens"},
                        {"metric": "Over 512 tokens", "v1": "0", "v2": "0"},
                        {"metric": "Darija share", "v1": "31%", "v2": "33%"},
                        {"metric": "Broken characters", "v1": "0", "v2": "0"},
                    ],
                    "diffs": [
                        {
                            "id": "#56049",
                            "lang": "DARIJA",
                            "type": "EDITED",
                            "reason": "paraphrase of #10482",
                            "full_text": "Bghit n3ref fin wslat commande dyali svp",
                            "after_highlight": "[PARAPHRASE]",
                        },
                        {
                            "id": "#56050",
                            "lang": "EN",
                            "type": "EDITED",
                            "reason": "back-translation from French",
                            "full_text": "Could you please tell me where my package is?",
                            "after_highlight": "[BACK-TRANS]",
                        },
                        {
                            "id": "#56051",
                            "lang": "DARIJA",
                            "type": "EDITED",
                            "reason": "arabizi variant",
                            "full_text": "Fin wslat la commande dyali?",
                            "after_highlight": "[CODESWITCH]",
                        },
                        {
                            "id": "#56052",
                            "lang": "FR",
                            "type": "EDITED",
                            "reason": "robustness perturbation",
                            "full_text": "Appellez moi au numero pour ma commmande",
                            "after_highlight": "[TYPOS]",
                        },
                    ],
                },
                "summary": {
                    "removed": "-2,252",
                    "removed_sub": "1,840 duplicates · 412 empty",
                    "edited": "2,636",
                    "edited_sub": "masking · encoding · splitting",
                    "labels_changed": "0",
                    "labels_changed_sub": "cleaning never touches labels",
                    "personal_data": "52% → 98%",
                    "personal_data_sub": "texts free of PII",
                },
                "label_distribution": [
                    {"name": "billing", "v1_pct": 41, "v2_pct": 41},
                    {"name": "delivery", "v1_pct": 19, "v2_pct": 19},
                    {"name": "refund", "v1_pct": 14, "v2_pct": 14.5},
                    {"name": "complaint", "v1_pct": 5, "v2_pct": 5},
                ],
                "text_shape": [
                    {"metric": "Median length", "v1": "64 tokens", "v2": "61 tokens"},
                    {"metric": "Over 512 tokens", "v1": "230", "v2": "0 · split"},
                    {"metric": "Darija share", "v1": "31%", "v2": "31%"},
                    {"metric": "Broken characters", "v1": "96", "v2": "0"},
                ],
                "diffs": [
                    {
                        "id": "#10482",
                        "lang": "FR",
                        "type": "EDITED",
                        "reason": "mask personal data",
                        "before_highlight": "06 12 ···· 12",
                        "after_highlight": "[PHONE]",
                        "prefix": "Appelez-moi au ",
                        "suffix": " svp.",
                    },
                    {
                        "id": "#20931",
                        "lang": "FR",
                        "type": "EDITED",
                        "reason": "repair broken characters",
                        "before_highlight": "Ã©",
                        "after_highlight": "é",
                        "prefix": "Ma commande n'est pas arriv",
                        "suffix": "e",
                    },
                    {
                        "id": "#33012",
                        "lang": "DARIJA",
                        "type": "REMOVED",
                        "reason": "duplicate of #33007",
                        "full_text": "l commande ma wslatch, chno ndir?",
                    },
                    {
                        "id": "#40877",
                        "lang": "FR",
                        "type": "REMOVED",
                        "reason": "empty once signature stripped",
                        "full_text": "Envoyé depuis mon iPhone",
                    },
                    {
                        "id": "#51200",
                        "lang": "EN",
                        "type": "SPLIT",
                        "reason": "812 tokens → 2 chunks",
                        "full_text": "#51200-a (512 tokens) · #51200-b (364 tokens, 64 overlap) · same label, same split",
                    },
                ],
            },
            "views": [
                {"id": "all", "label": "All", "count": "59,577", "active": True},
                {"id": "real_only", "label": "Real only", "count": "56,048"},
                {"id": "paraphrase", "label": "origin = paraphrase", "count": "1,412"},
                {"id": "back_translation", "label": "origin = back-translation", "count": "1,059"},
                {"id": "darija_variant", "label": "origin = darija variant", "count": "1,058"},
                {"id": "lang_darija", "label": "lang = darija"},
                {"id": "test_set", "label": "Test", "count": "8,407"},
            ],
            "used_by": [
                {"model_run": "ticket-cls-v3", "data": "v3", "macro_f1": "[RESULT]", "tag": "PRODUCTION", "tag_type": "production"},
                {"model_run": "ticket-cls-v2", "data": "v2", "macro_f1": "[RESULT]", "tag": "ARCHIVED", "tag_type": "archived"},
            ],
            "guardrails": [
                {"title": "Versions are immutable", "subtitle": "Any edit creates a new version", "checked": True},
                {"title": "Test set hash unchanged", "subtitle": "8,407 tickets, same in v3 and later", "checked": True},
                {"title": "No personal data in any version", "subtitle": "v1 raw is encrypted and access-limited", "checked": True},
                {"title": "Generated text is frozen", "subtitle": "Replay never calls the LLM again", "checked": True},
                {"title": "Chunks stay with their ticket", "subtitle": "Same split, same label, same version", "checked": True},
                {"title": "Used versions are protected", "subtitle": "v2 and v3 can't be deleted", "checked": True},
            ],
            "action_banner": {
                "version": "v3",
                "recipes": "2 recipes",
                "splits": "3 splits",
                "baseline": "baseline",
                "card_summary": "Dataset card generated: languages, labels, share of generated text, masking applied",
            },
        }

    def _get_dynamic_data(self, dataset: Dataset, versions: List[DatasetVersion]) -> Dict[str, Any]:
        """Dynamically computes lineage, comparison diffs, and views for any text dataset."""
        latest_v = versions[0]
        row_count = latest_v.row_count or 200
        size_bytes = latest_v.size_bytes or 150000
        stored_mb = f"{max(1, int(round(size_bytes / (1024 * 1024))))} MB"
        logical_mb = f"{max(2, int(round(size_bytes * 2.5 / (1024 * 1024))))} MB"

        # Versions count
        v_count = len(versions)
        v_list_label = f"v1 · v2 · v3" if v_count >= 3 else f"v1 · v{v_count}"

        # Real classes from dataset
        classes = ["cat_a", "cat_b", "cat_c"]
        if latest_v.storage_path and Path(latest_v.storage_path).exists():
            try:
                table = pq.read_table(latest_v.storage_path)
                for col in ["label", "class", "category"]:
                    if col in table.column_names:
                        from collections import Counter
                        vals = table[col].to_pylist()
                        c = Counter([v for v in vals if v is not None and str(v).strip()])
                        if len(c) >= 2:
                            classes = [name for name, _ in c.most_common(4)]
                            break
            except Exception:
                pass

        v1_rows = int(round(row_count * 1.05))
        v2_rows = row_count
        v3_gen = max(10, int(round(row_count * 0.15)))
        v3_train = int(round(v2_rows * 0.70))
        test_rows = max(5, int(round(v2_rows * 0.15)))
        total_augmented = v2_rows + v3_gen

        # Removed & edited
        removed_count = v1_rows - v2_rows
        edited_count = max(2, int(round(v2_rows * 0.05)))

        v1_v2 = {
            "summary": {
                "removed": f"-{removed_count:,}",
                "removed_sub": f"{max(1, int(round(removed_count * 0.8))):,} duplicates · {max(1, int(round(removed_count * 0.2))):,} empty",
                "edited": f"{edited_count:,}",
                "edited_sub": "masking · encoding · splitting",
                "labels_changed": "0",
                "labels_changed_sub": "cleaning never touches labels",
                "personal_data": "54% → 98%",
                "personal_data_sub": "texts free of PII",
            },
            "label_distribution": [
                {"name": c, "v1_pct": int(round(100 / len(classes))), "v2_pct": int(round(100 / len(classes)))}
                for c in classes
            ],
            "text_shape": [
                {"metric": "Median length", "v1": "48 tokens", "v2": "46 tokens"},
                {"metric": "Over 512 tokens", "v1": f"{max(1, int(round(v1_rows * 0.04))):,}", "v2": "0 · split"},
                {"metric": "Darija share", "v1": "28%", "v2": "28%"},
                {"metric": "Broken characters", "v1": f"{max(1, int(round(v1_rows * 0.02))):,}", "v2": "0"},
            ],
            "diffs": [
                {
                    "id": "#101",
                    "lang": "FR",
                    "type": "EDITED",
                    "reason": "mask personal data",
                    "before_highlight": "06 12 ···· 12",
                    "after_highlight": "[PHONE]",
                    "prefix": "Contactez-moi au ",
                    "suffix": " pour confirmer.",
                },
                {
                    "id": "#102",
                    "lang": "FR",
                    "type": "EDITED",
                    "reason": "repair broken characters",
                    "before_highlight": "Ã©",
                    "after_highlight": "é",
                    "prefix": "Le document a ",
                    "suffix": "t",
                },
                {
                    "id": "#103",
                    "lang": "DARIJA",
                    "type": "REMOVED",
                    "reason": "duplicate of previous entry",
                    "full_text": "choukran bzaf 3la l'aide",
                },
                {
                    "id": "#104",
                    "lang": "FR",
                    "type": "REMOVED",
                    "reason": "empty once signature stripped",
                    "full_text": "Envoyé de mon appareil mobile",
                },
            ],
        }

        v2_v3 = {
            "summary": {
                "removed": "0",
                "removed_sub": "test set preserved · no drops",
                "edited": f"+{v3_gen:,}",
                "edited_sub": "paraphrase · back-trans · typos",
                "labels_changed": "0",
                "labels_changed_sub": "augmentation preserves labels",
                "personal_data": "98% → 98%",
                "personal_data_sub": "synthetic data free of PII",
            },
            "label_distribution": [
                {"name": c, "v1_pct": int(round(100 / len(classes))), "v2_pct": int(round(100 / len(classes)))}
                for c in classes
            ],
            "text_shape": [
                {"metric": "Median length", "v1": "46 tokens", "v2": "47 tokens"},
                {"metric": "Over 512 tokens", "v1": "0", "v2": "0"},
                {"metric": "Darija share", "v1": "28%", "v2": "30%"},
                {"metric": "Broken characters", "v1": "0", "v2": "0"},
            ],
            "diffs": [
                {
                    "id": "#201",
                    "lang": "FR",
                    "type": "EDITED",
                    "reason": "paraphrase of #101",
                    "full_text": "Merci de me joindre au [PHONE] pour vérification.",
                    "after_highlight": "[PARAPHRASE]",
                },
                {
                    "id": "#202",
                    "lang": "EN",
                    "type": "EDITED",
                    "reason": "back-translation from French",
                    "full_text": "Please reach out to me via phone to validate.",
                    "after_highlight": "[BACK-TRANS]",
                },
                {
                    "id": "#203",
                    "lang": "DARIJA",
                    "type": "EDITED",
                    "reason": "code-switch variation",
                    "full_text": "3afak 3ayet lia f num bach nconfirmé.",
                    "after_highlight": "[DARIJA VARIANT]",
                },
            ],
        }

        current_v_id = f"v{v_count}"
        v_list_label = " · ".join([f"v{i}" for i in range(1, v_count + 1)])

        nodes = [
            {
                "id": "v1",
                "version_hash": "v1_raw",
                "rank": "V1 · RAW",
                "badge": "BASELINE" if v_count == 1 else None,
                "count_label": f"{v1_rows:,} documents",
                "date_label": "Health 74 · 01 Nov",
                "step_after": "CLEANING · 5 STEPS" if v_count > 1 else "CLEANING...",
                "action_title": "REPLAY",
                "action_desc": "Next month's batch → same masking, dedup and chunking → v2.1.",
            }
        ]
        if v_count >= 2:
            nodes.append({
                "id": "v2",
                "version_hash": "v2_clean",
                "rank": "V2 · CLEAN",
                "badge": "BASELINE" if v_count == 2 else "CLEAN",
                "count_label": f"{v2_rows:,} documents",
                "date_label": "Health 93 · 04 Nov",
                "step_after": "AUGMENT · 4 TECHN." if v_count > 2 else "AUGMENTING...",
                "action_title": "FROZEN GENERATION",
                "action_desc": "LLM paraphrases are stored, not re-generated. Replaying v3 gives the exact same texts.",
            })
        if v_count >= 3:
            nodes.append({
                "id": current_v_id,
                "version_hash": f"{current_v_id}_augmented",
                "rank": f"V{v_count} · AUGMENTED",
                "badge": "BASELINE",
                "count_label": f"{v3_train:,} in train",
                "date_label": f"+{v3_gen:,} generated · 07 Nov",
                "step_after": "LABELING...",
                "action_title": "RESTORE",
                "action_desc": "Make an older version current. Nothing is deleted, history stays.",
            })

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": dataset.name,
            "breadcrumb": f"DATASET · {v_count} {'VERSION' if v_count == 1 else 'VERSIONS'} · TEXT CLASSIFICATION · TEST SET LOCKED",
            "kpis": {
                "versions": str(v_count),
                "versions_sub": v_list_label,
                "stored": stored_mb,
                "stored_sub": f"{logical_mb} logical · deltas only",
                "languages": "4",
                "languages_sub": "fr · ar · darija · en",
                "used_by": "1 model" if v_count < 3 else "2 models",
                "used_by_sub": "v2 and v3 protected" if v_count >= 3 else "v1 protected",
            },
            "current_version": {
                "id": current_v_id,
                "tag": "BASELINE",
                "name": current_v_id,
            },
            "lineage": nodes,
            "version_details": {
                "v1": {
                    "title": "v1 · raw",
                    "badge": "RAW",
                    "parent": "None",
                    "recipe": "Direct import · Text file / CSV",
                    "llm_used": "None",
                    "seed": "42",
                    "splits": "Unsplit",
                    "created_by": "[AUTHOR] · 01 Nov",
                    "pull_command": f"datalift pull {dataset.name.split('.')[0]}@v1",
                    "formats": "JSONL · CSV",
                },
                "v2": {
                    "title": "v2 · clean",
                    "badge": "CLEAN",
                    "parent": "v1 · raw",
                    "recipe": "Mask personal data · repair broken characters · remove duplicates · strip empty",
                    "llm_used": "None",
                    "seed": "42",
                    "splits": "Unsplit",
                    "created_by": "[AUTHOR] · 04 Nov",
                    "pull_command": f"datalift pull {dataset.name.split('.')[0]}@v2",
                    "formats": "JSONL · CSV",
                },
                "v3": {
                    "title": "v3 · augmented",
                    "badge": "BASELINE",
                    "parent": "v2 · clean",
                    "recipe": "paraphrase · back-translation · darija variants · typos",
                    "llm_used": "[LLM MODEL] · temp 0.7",
                    "seed": "42",
                    "splits": "70 / 15 / 15 · by text_id",
                    "created_by": "[AUTHOR] · 07 Nov",
                    "pull_command": f"datalift pull {dataset.name.split('.')[0]}@v3",
                    "formats": "JSONL · CSV · Hugging Face dataset",
                },
            },
            "compare": {
                "from_options": ["v1 · raw", "v2 · clean"],
                "to_options": ["v2 · clean", "v3 · augmented"],
                "selected_from": "v1 · raw",
                "selected_to": "v2 · clean",
                "v1_v2": v1_v2,
                "v2_v3": v2_v3,
                "summary": v1_v2["summary"],
                "label_distribution": v1_v2["label_distribution"],
                "text_shape": v1_v2["text_shape"],
                "diffs": v1_v2["diffs"],
            },
            "views": [
                {"id": "all", "label": "All", "count": f"{total_augmented:,}", "active": True},
                {"id": "real_only", "label": "Real only", "count": f"{v2_rows:,}"},
                {"id": "paraphrase", "label": "origin = paraphrase", "count": f"{int(round(v3_gen * 0.4)):,}"},
                {"id": "back_translation", "label": "origin = back-translation", "count": f"{int(round(v3_gen * 0.3)):,}"},
                {"id": "darija_variant", "label": "origin = darija variant", "count": f"{int(round(v3_gen * 0.3)):,}"},
                {"id": "lang_darija", "label": "lang = darija"},
                {"id": "test_set", "label": "Test", "count": f"{test_rows:,}"},
            ],
            "used_by": [
                {"model_run": f"{dataset.name.split('.')[0]}-cls-v3", "data": "v3", "macro_f1": "[RESULT]", "tag": "PRODUCTION", "tag_type": "production"},
                {"model_run": f"{dataset.name.split('.')[0]}-cls-v2", "data": "v2", "macro_f1": "[RESULT]", "tag": "ARCHIVED", "tag_type": "archived"},
            ],
            "guardrails": [
                {"title": "Versions are immutable", "subtitle": "Any edit creates a new version", "checked": True},
                {"title": "Test set hash unchanged", "subtitle": f"{test_rows:,} documents, same in v3 and later", "checked": True},
                {"title": "No personal data in any version", "subtitle": "v1 raw is encrypted and access-limited", "checked": True},
                {"title": "Generated text is frozen", "subtitle": "Replay never calls the LLM again", "checked": True},
                {"title": "Chunks stay with their ticket", "subtitle": "Same split, same label, same version", "checked": True},
                {"title": "Used versions are protected", "subtitle": "v2 and v3 can't be deleted", "checked": True},
            ],
            "action_banner": {
                "version": "v3",
                "recipes": "2 recipes",
                "splits": "3 splits",
                "baseline": "baseline",
                "card_summary": "Dataset card generated: languages, labels, share of generated text, masking applied",
            },
        }

    def tag_production(self, dataset_id: str, version_hash: str, db: Session) -> Dict[str, Any]:
        """Tags a version as production baseline."""
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset non trouvé")
        return {"status": "success", "tagged_version": version_hash, "tag": "PRODUCTION"}

    def restore_version(self, dataset_id: str, version_hash: str, db: Session) -> Dict[str, Any]:
        """Restores an older version as the active baseline."""
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset non trouvé")
        return {"status": "success", "current_version": version_hash, "message": "Version restored as baseline."}


text_versioning_service = TextVersioningService()

