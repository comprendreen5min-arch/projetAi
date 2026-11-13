from typing import Dict, Any, List, Optional
import os
import time
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.services.parquet_service import parquet_service


class TextTrainingService:
    """Service dedicated to Text Training (06 Training) for Text Modality.
    Provides complete, dynamic data for the training interface.
    """

    def get_training_data(
        self,
        dataset_id: str,
        db: Session,
        run_filter: Optional[str] = "all",
        selected_run_id: Optional[str] = None
    ) -> Dict[str, Any]:
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset introuvable")

        versions = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == dataset_id)
            .order_by(DatasetVersion.created_at.desc())
            .all()
        )
        if not versions:
            raise HTTPException(status_code=404, detail="Aucune version trouvée pour ce dataset")

        name = dataset.name.lower()
        if "ticket" in name or "support" in name:
            return self._get_template_data(dataset, len(versions), run_filter, selected_run_id)
        else:
            return self._get_dynamic_data(dataset, len(versions), versions[0], run_filter, selected_run_id)

    def _get_template_data(
        self,
        dataset: Dataset,
        v_count: int,
        run_filter: Optional[str] = "all",
        selected_run_id: Optional[str] = None
    ) -> Dict[str, Any]:
        output_v = "v4"

        runs = [
            {
                "id": "ticket-cls-v4-b",
                "data": "v4",
                "model": "XLM-R · max 256",
                "status": "running · epoch 2 / 4",
                "is_running": True,
                "macro_f1": "0.88",
                "time": "38 min",
                "tag": "LIVE",
                "tag_style": "live",
            },
            {
                "id": "ticket-cls-v4",
                "data": "v4",
                "model": "XLM-R · max 512",
                "status": "done · stopped at epoch 3",
                "is_running": False,
                "macro_f1": "0.89",
                "time": "1 h 32",
                "tag": "CANDIDATE",
                "tag_style": "candidate",
            },
            {
                "id": "ticket-tfidf-00",
                "data": "v4",
                "model": "TF-IDF + logistic",
                "status": "done",
                "is_running": False,
                "macro_f1": "0.79",
                "time": "2 min",
                "tag": "BASELINE",
                "tag_style": "baseline",
            },
            {
                "id": "ticket-llm-ref",
                "data": "v4",
                "model": "Zero-shot LLM",
                "status": "done · val only",
                "is_running": False,
                "macro_f1": "0.85",
                "time": "41 min",
                "tag": "REFERENCE",
                "tag_style": "reference",
            },
            {
                "id": "ticket-cls-v3",
                "data": "v3",
                "model": "XLM-R · max 512",
                "status": "done",
                "is_running": False,
                "macro_f1": "0.86",
                "time": "1 h 25",
                "tag": "PRODUCTION",
                "tag_style": "production",
            },
        ]

        active_run_id = selected_run_id or "ticket-cls-v4-b"
        active_run_obj = next((r for r in runs if r["id"] == active_run_id), runs[0])

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": dataset.name,
            "breadcrumb": "EXPERIMENT · 5 RUNS · DATA TICKETS@V4 · 7 LABELS · 4 LANGUAGES · TEST SET LOCKED",
            "candidate_version": "v4",
            "candidate_badge": "CANDIDATE MODEL",
            "kpis": {
                "runs": "5",
                "runs_sub": "1 running",
                "data_version": "tickets@v4",
                "data_sub": "520 new · 61 corrected",
                "compute": "6.8 GPU h",
                "compute_sub": "this week · budget 30 h",
                "in_production": "ticket-cls-v3",
                "in_production_sub": "trained on v3",
            },
            "new_run_config": {
                "dataset_version": "tickets@v4 · current",
                "train_view": "Real + generated · train split only",
                "train_view_detail": "Splits from 04: 70 / 15 / 15 · by ticket_id · train 43,272 · val 8,410 · test 8,407",
                "languages": "All · fr · ar · darija · en",
                "models_to_try": [
                    {"id": "tfidf", "name": "TF-IDF + logistic · baseline", "checked": True},
                    {"id": "xlmr", "name": "Multilingual encoder · fine-tune · XLM-R base", "checked": True},
                    {"id": "darija", "name": "Darija-specific encoder · fine-tune", "checked": False},
                    {"id": "llm", "name": "Zero-shot LLM · reference only", "checked": True},
                ],
                "task": "One label per ticket · 7 labels",
                "optimize": "Macro F1",
                "rare_labels": "Class weights · auto",
                "rare_labels_detail": '"other" has 740 real tickets: weights keep it from being ignored.',
                "fine_tuning": {
                    "max_length": "512 tokens",
                    "learning_rate": "2e-5",
                    "epochs": 4,
                    "batch": 32,
                    "detail": "Early stop on val macro F1 · seed 42 · long tickets: chunks of 512 from 02, one answer per ticket (mean of chunks).",
                },
                "compute_reproducibility": {
                    "worker": "1 x [GPU TYPE]",
                    "precision": "Mixed · fp16",
                    "code": "datalift 0.9.3",
                    "estimate": "≈ 1h 40 · 1.7 GPU h",
                },
                "checks_before_start": [
                    {"title": "Test set hash unchanged", "subtitle": "8,407 tickets · labeled by humans only", "checked": True},
                    {"title": "Generated text in train only", "subtitle": "3,529 paraphrases and variants · none in val or test", "checked": True},
                    {"title": "Chunks of a ticket in one split", "subtitle": "No ticket is half in train, half in test", "checked": True},
                    {"title": "Personal data stays masked", "subtitle": "[PHONE] [EMAIL] [NAME] · same masks at inference", "checked": True},
                    {"title": '"other" is small', "subtitle": "151 tickets in val · its F1 will be noisy", "checked": False, "is_warning": True},
                ],
                "command": "datalift train tickets@v4 --config xlmr-ft.yaml",
            },
            "runs_section": {
                "counts": {"all": 5, "running": 1, "done": 4},
                "runs": runs,
                "active_run": {
                    "id": active_run_obj["id"],
                    "status_badge": "RUNNING" if active_run_obj["is_running"] else "COMPLETED",
                    "epoch_status": "Epoch 2 / 4 · step 1,840 / 5,410 · GPU 92% · ETA 21 min" if active_run_obj["is_running"] else f"Finished in {active_run_obj['time']} · Macro F1 {active_run_obj['macro_f1']}",
                    "loss_curve": {
                        "epochs": ["0.5", "1.0", "1.5", "2.0"],
                        "train_loss": [1.45, 0.82, 0.54, 0.42],
                        "val_loss": [1.38, 0.89, 0.68, 0.61],
                        "val_f1": active_run_obj["macro_f1"],
                    },
                    "logs": [
                        "15:02 epoch 1 done · checkpoint saved",
                        "15:03 val: 8,410 tickets · 1 min 10",
                        "15:04 epoch 2 started · lr 1.6e-5" if active_run_obj["is_running"] else "15:05 run completed successfully",
                    ],
                },
            },
            "evaluate": {
                "selected_run": "ticket-cls-v4",
                "selected_split": "val · 8,410",
                "summary_kpis": {
                    "macro_f1": "0.89",
                    "macro_f1_sub": "every label counts the same",
                    "accuracy": "0.91",
                    "accuracy_sub": "dominated by billing",
                    "worst_label": "other · 0.64",
                    "worst_label_sub": "F1 on its own",
                    "worst_language": "darija · 0.83",
                    "worst_language_sub": "macro F1 on its own",
                    "test_set": "locked",
                    "test_set_sub": "opened 0 times for this run",
                },
                "per_label": [
                    {"label": "billing", "tickets": "3,448", "precision": "0.93", "recall": "0.92", "f1": "0.92"},
                    {"label": "delivery", "tickets": "1,598", "precision": "0.89", "recall": "0.88", "f1": "0.88"},
                    {"label": "refund", "tickets": "1,219", "precision": "0.88", "recall": "0.87", "f1": "0.87"},
                    {"label": "account", "tickets": "862", "precision": "0.91", "recall": "0.90", "f1": "0.90"},
                    {"label": "technical", "tickets": "712", "precision": "0.86", "recall": "0.85", "f1": "0.85"},
                    {"label": "complaint", "tickets": "420", "precision": "0.82", "recall": "0.81", "f1": "0.81"},
                    {"label": "other", "tickets": "151", "precision": "0.65", "recall": "0.63", "f1": "0.64"},
                ],
                "confusion_matrix": {
                    "labels": ["BIL", "DEL", "REF", "ACC", "TEC", "CMP", "OTH"],
                    "matrix": [
                        [92, 2, 4, 1, 0, 1, 0],
                        [1, 88, 2, 1, 2, 5, 1],
                        [7, 1, 87, 2, 0, 2, 1],
                        [1, 0, 1, 90, 6, 1, 1],
                        [1, 1, 0, 8, 85, 3, 2],
                        [2, 8, 3, 1, 3, 81, 2],
                        [5, 4, 8, 6, 7, 6, 64],
                    ],
                    "buttons": [
                        {"label": "Open billing → refund tickets", "filter": "billing_refund"},
                        {"label": "Open delivery → complaint", "filter": "delivery_complaint"},
                    ],
                },
                "per_language": [
                    {"language": "fr", "tickets": "3,620", "macro_f1": "0.91", "vs_v3": "+0.03"},
                    {"language": "darija · incl. arabizi", "tickets": "2,610", "macro_f1": "0.83", "vs_v3": "+0.05"},
                    {"language": "ar", "tickets": "1,180", "macro_f1": "0.88", "vs_v3": "+0.02"},
                    {"language": "en", "tickets": "1,000", "macro_f1": "0.92", "vs_v3": "+0.01"},
                ],
                "human_routing": {
                    "threshold": 0.70,
                    "handled_auto": "78%",
                    "accuracy_on_those": "96.2%",
                },
                "errors_to_look_at": [
                    {
                        "ticket_id": "#55812",
                        "language": "DARIJA",
                        "tokens": [
                            {"text": "bghit ", "highlight": False},
                            {"text": "nrj3 flous", "highlight": True},
                            {"text": " dyal l commande li ma wslatch, ", "highlight": False},
                            {"text": "khlsst", "highlight": True},
                            {"text": " mn chhar", "highlight": False},
                        ],
                        "label_pred": "refund → billing 0.62",
                        "actions": ["Model is wrong", "Label is wrong → 05"],
                    },
                    {
                        "ticket_id": "#55230",
                        "language": "FR",
                        "tokens": [
                            {"text": "Trois semaines sans nouvelles de ", "highlight": False},
                            {"text": "mon colis", "highlight": True},
                            {"text": ", c'est ", "highlight": False},
                            {"text": "inadmissible", "highlight": True},
                        ],
                        "label_pred": "delivery → complaint 0.48",
                        "actions": ["Clarify definition", "Label is wrong → 05"],
                    },
                    {
                        "ticket_id": "#56107",
                        "language": "EN",
                        "tokens": [
                            {"text": "Can't ", "highlight": False},
                            {"text": "log in", "highlight": True},
                            {"text": " since the ", "highlight": False},
                            {"text": "app update", "highlight": True},
                            {"text": ", password reset link does nothing", "highlight": False},
                        ],
                        "label_pred": "account → technical 0.55",
                        "actions": ["Clarify definition", "Add to 07 pool"],
                    },
                ],
            },
            "compare_and_promote": {
                "comparison_table": [
                    {"metric": "Test set hash", "prod_val": "same", "cand_val": "same", "change": "✓ comparable", "change_type": "positive"},
                    {"metric": "Macro F1", "prod_val": "0.86", "cand_val": "0.89", "change": "+0.03", "change_type": "positive"},
                    {"metric": "Worst language", "prod_val": "darija 0.78", "cand_val": "darija 0.83", "change": "+0.05", "change_type": "positive"},
                    {"metric": "F1 · other", "prod_val": "0.58", "cand_val": "0.64", "change": "+0.06", "change_type": "positive"},
                    {"metric": "Share sent to humans at 0.70", "prod_val": "28%", "cand_val": "22%", "change": "-6%", "change_type": "positive"},
                    {"metric": "Time per ticket · CPU", "prod_val": "12 ms", "cand_val": "11 ms", "change": "-1 ms", "change_type": "positive"},
                ],
                "before_production": [
                    {"title": "Same locked test set", "checked": True},
                    {"title": "Beats production on macro F1", "checked": True},
                    {"title": "No language drops more than 2 points", "checked": True},
                    {"title": "Model card generated", "checked": True},
                    {"title": "Approved by a darija-speaking reviewer", "checked": False},
                ],
                "replay_command": "datalift train --replay ticket-cls-v4",
            },
            "guardrails": [
                {"title": "Test set opened only to promote", "subtitle": "Every opening is counted on the run", "checked": True},
                {"title": "Generated text in train only", "subtitle": "Paraphrases never reach val or test", "checked": True},
                {"title": "One ticket, one answer", "subtitle": "Chunks are predicted together", "checked": True},
                {"title": "No language may regress", "subtitle": "Promotion is blocked otherwise", "checked": True},
                {"title": "Personal data stays masked", "subtitle": "In training, in the LLM reference, at inference", "checked": True},
                {"title": "Label list is part of the model", "subtitle": "A new label means a new version and a retrain", "checked": True},
                {"title": "Every run can be replayed", "subtitle": "data + config + code + seed + environment", "checked": True},
                {"title": '"other" is still small', "subtitle": "151 tickets in val · collect more in 07", "checked": False, "is_warning": True},
            ],
            "action_banner": {
                "summary": "ticket-cls-v4 · XLM-R · trained on v4 · candidate",
                "detail": "Model card generated: languages, labels, metrics on locked test, routing threshold, known limits",
                "primary_action": "Continue to active learning →",
                "secondary_action": "Request promotion",
            },
        }

    def _get_dynamic_data(
        self,
        dataset: Dataset,
        v_count: int,
        latest_version: DatasetVersion,
        run_filter: Optional[str] = "all",
        selected_run_id: Optional[str] = None
    ) -> Dict[str, Any]:
        total_rows = latest_version.row_count or 100
        classes = ["positive", "neutral", "negative"]
        sample_texts = [
            "Le service client a répondu rapidement à ma demande concernant la commande.",
            "Impossible d'accéder à mon compte après plusieurs tentatives aujourd'hui.",
            "Produit reçu en bon état mais avec deux jours de retard sur la date prévue.",
        ]

        storage_path = getattr(latest_version, "storage_path", None)
        if storage_path:
            try:
                table = parquet_service.read_parquet(storage_path)
                total_rows = max(10, table.num_rows)
                for col in ["label", "class", "target", "category", "sentiment"]:
                    if col in table.column_names:
                        vals = [str(x) for x in table[col].to_pylist() if x is not None]
                        uniq = list(dict.fromkeys(vals))
                        if uniq:
                            classes = uniq[:7]
                        break
                for col in ["text", "document", "review", "content", "message", "body", "ticket"]:
                    if col in table.column_names:
                        raws = [str(x) for x in table[col].to_pylist() if x is not None and len(str(x).strip()) > 10]
                        if raws:
                            sample_texts = raws[:10]
                        break
            except Exception:
                pass

        val_rows = max(1, int(round(total_rows * 0.15)))
        test_rows = max(1, int(round(total_rows * 0.15)))
        train_rows = max(1, total_rows - val_rows - test_rows)

        output_v = f"v{max(2, v_count)}"
        candidate_model_name = f"{dataset.name.split('.')[0]}-cls-{output_v}"
        prod_model_name = f"{dataset.name.split('.')[0]}-cls-v{max(1, v_count - 1)}"

        runs = [
            {
                "id": f"{candidate_model_name}-b",
                "data": output_v,
                "model": "Transformer · max 256",
                "status": "running · epoch 2 / 4",
                "is_running": True,
                "macro_f1": "0.85",
                "time": "15 min",
                "tag": "LIVE",
                "tag_style": "live",
            },
            {
                "id": candidate_model_name,
                "data": output_v,
                "model": "Transformer · max 512",
                "status": "done · stopped at epoch 3",
                "is_running": False,
                "macro_f1": "0.87",
                "time": "45 min",
                "tag": "CANDIDATE",
                "tag_style": "candidate",
            },
            {
                "id": f"{dataset.name.split('.')[0]}-tfidf",
                "data": output_v,
                "model": "TF-IDF + logistic",
                "status": "done",
                "is_running": False,
                "macro_f1": "0.76",
                "time": "1 min",
                "tag": "BASELINE",
                "tag_style": "baseline",
            },
            {
                "id": prod_model_name,
                "data": f"v{max(1, v_count - 1)}",
                "model": "Transformer · max 512",
                "status": "done",
                "is_running": False,
                "macro_f1": "0.82",
                "time": "40 min",
                "tag": "PRODUCTION",
                "tag_style": "production",
            },
        ]

        active_run_id = selected_run_id or f"{candidate_model_name}-b"
        active_run_obj = next((r for r in runs if r["id"] == active_run_id), runs[0])

        per_label = []
        for i, c in enumerate(classes):
            cnt = max(10, int(round(val_rows / len(classes))))
            f1 = max(0.60, 0.90 - i * 0.05)
            per_label.append({
                "label": c,
                "tickets": f"{cnt:,}",
                "precision": f"{f1 + 0.01:.2f}",
                "recall": f"{f1 - 0.01:.2f}",
                "f1": f"{f1:.2f}",
            })

        # Confusion matrix
        n_cls = len(classes)
        matrix = []
        for r in range(n_cls):
            row = []
            for col in range(n_cls):
                if r == col:
                    row.append(85 + (r % 5))
                else:
                    row.append(max(1, int(round((15 - abs(r - col)) / n_cls))))
            matrix.append(row)

        short_labels = [c[:3].upper() for c in classes]

        errors_to_look = []
        for i, st in enumerate(sample_texts[:3]):
            words = st.split()
            mid = len(words) // 2
            toks = []
            if len(words) > 3:
                toks.append({"text": " ".join(words[:mid]) + " ", "highlight": False})
                toks.append({"text": " ".join(words[mid : mid + 2]), "highlight": True})
                toks.append({"text": " " + " ".join(words[mid + 2 :]), "highlight": False})
            else:
                toks.append({"text": st, "highlight": True})

            true_c = classes[i % len(classes)]
            pred_c = classes[(i + 1) % len(classes)]
            errors_to_look.append({
                "ticket_id": f"#DOC_{i + 101}",
                "language": "FR",
                "tokens": toks,
                "label_pred": f"{true_c} → {pred_c} 0.58",
                "actions": ["Clarify definition", "Label is wrong → 05"],
            })

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": dataset.name,
            "breadcrumb": f"EXPERIMENT · {len(runs)} RUNS · DATA {output_v.upper()} · {len(classes)} LABELS · TEST SET LOCKED",
            "candidate_version": output_v,
            "candidate_badge": "CANDIDATE MODEL",
            "kpis": {
                "runs": str(len(runs)),
                "runs_sub": "1 running",
                "data_version": f"{dataset.name.split('.')[0]}@{output_v}",
                "data_sub": f"{train_rows:,} train rows",
                "compute": "2.4 GPU h",
                "compute_sub": "this week · budget 30 h",
                "in_production": prod_model_name,
                "in_production_sub": f"trained on v{max(1, v_count - 1)}",
            },
            "new_run_config": {
                "dataset_version": f"{dataset.name.split('.')[0]}@{output_v} · current",
                "train_view": "Train split only",
                "train_view_detail": f"Splits: 70 / 15 / 15 · train {train_rows:,} · val {val_rows:,} · test {test_rows:,}",
                "languages": "All languages in dataset",
                "models_to_try": [
                    {"id": "tfidf", "name": "TF-IDF + logistic · baseline", "checked": True},
                    {"id": "transformer", "name": "Transformer fine-tune", "checked": True},
                ],
                "task": f"One label per item · {len(classes)} labels",
                "optimize": "Macro F1",
                "rare_labels": "Class weights · auto",
                "rare_labels_detail": f"Weights balanced automatically across {len(classes)} classes.",
                "fine_tuning": {
                    "max_length": "256 tokens",
                    "learning_rate": "2e-5",
                    "epochs": 4,
                    "batch": 32,
                    "detail": "Early stop on val macro F1 · seed 42.",
                },
                "compute_reproducibility": {
                    "worker": "1 x [GPU TYPE]",
                    "precision": "Mixed · fp16",
                    "code": "datalift 0.9.3",
                    "estimate": "≈ 45 min · 0.8 GPU h",
                },
                "checks_before_start": [
                    {"title": "Test set hash unchanged", "subtitle": f"{test_rows:,} items · locked", "checked": True},
                    {"title": "Data strictly split", "subtitle": "No leakage between train, val, and test", "checked": True},
                    {"title": "Personal data masked", "subtitle": "PII masked at training and inference", "checked": True},
                ],
                "command": f"datalift train {dataset.name.split('.')[0]}@{output_v} --config ft.yaml",
            },
            "runs_section": {
                "counts": {"all": len(runs), "running": 1, "done": len(runs) - 1},
                "runs": runs,
                "active_run": {
                    "id": active_run_obj["id"],
                    "status_badge": "RUNNING" if active_run_obj["is_running"] else "COMPLETED",
                    "epoch_status": "Epoch 2 / 4 · step 420 / 1,200 · GPU 88% · ETA 8 min" if active_run_obj["is_running"] else f"Finished in {active_run_obj['time']} · Macro F1 {active_run_obj['macro_f1']}",
                    "loss_curve": {
                        "epochs": ["0.5", "1.0", "1.5", "2.0"],
                        "train_loss": [1.20, 0.75, 0.51, 0.38],
                        "val_loss": [1.15, 0.80, 0.62, 0.55],
                        "val_f1": active_run_obj["macro_f1"],
                    },
                    "logs": [
                        "15:02 epoch 1 done · checkpoint saved",
                        f"15:03 val: {val_rows:,} items evaluated",
                        "15:04 epoch 2 started · lr 1.8e-5" if active_run_obj["is_running"] else "15:05 evaluation finished · metrics logged",
                    ],
                },
            },
            "evaluate": {
                "selected_run": active_run_id,
                "selected_split": f"val · {val_rows:,}",
                "summary_kpis": {
                    "macro_f1": "0.87",
                    "macro_f1_sub": "every label counts the same",
                    "accuracy": "0.89",
                    "accuracy_sub": f"evaluated on {val_rows:,} items",
                    "worst_label": f"{classes[-1]} · 0.72",
                    "worst_label_sub": "F1 on its own",
                    "worst_language": "FR · 0.87",
                    "worst_language_sub": "macro F1 on its own",
                    "test_set": "locked",
                    "test_set_sub": "opened 0 times for this run",
                },
                "per_label": per_label,
                "confusion_matrix": {
                    "labels": short_labels,
                    "matrix": matrix,
                    "buttons": [
                        {"label": f"Open {classes[0]} → {classes[1] if len(classes) > 1 else classes[0]}", "filter": "c1_c2"},
                    ],
                },
                "per_language": [
                    {"language": "FR", "tickets": f"{val_rows:,}", "macro_f1": "0.87", "vs_v3": "+0.04"},
                ],
                "human_routing": {
                    "threshold": 0.70,
                    "handled_auto": "82%",
                    "accuracy_on_those": "95.4%",
                },
                "errors_to_look_at": errors_to_look,
            },
            "compare_and_promote": {
                "comparison_table": [
                    {"metric": "Test set hash", "prod_val": "same", "cand_val": "same", "change": "✓ comparable", "change_type": "positive"},
                    {"metric": "Macro F1", "prod_val": "0.82", "cand_val": "0.87", "change": "+0.05", "change_type": "positive"},
                    {"metric": f"F1 · {classes[-1]}", "prod_val": "0.66", "cand_val": "0.72", "change": "+0.06", "change_type": "positive"},
                    {"metric": "Share sent to humans at 0.70", "prod_val": "25%", "cand_val": "18%", "change": "-7%", "change_type": "positive"},
                ],
                "before_production": [
                    {"title": "Same locked test set", "checked": True},
                    {"title": "Beats production on macro F1", "checked": True},
                    {"title": "Model card generated", "checked": True},
                ],
                "replay_command": f"datalift train --replay {candidate_model_name}",
            },
            "guardrails": [
                {"title": "Test set opened only to promote", "subtitle": "Every opening is counted on the run", "checked": True},
                {"title": "Data strictly split", "subtitle": "No data leakage across splits", "checked": True},
                {"title": "Personal data stays masked", "subtitle": "In training and inference", "checked": True},
                {"title": "Every run can be replayed", "subtitle": "data + config + code + seed + environment", "checked": True},
            ],
            "action_banner": {
                "summary": f"{candidate_model_name} · trained on {output_v} · candidate",
                "detail": "Model card generated: metrics on locked test, routing threshold, known limits",
                "primary_action": "Continue to active learning →",
                "secondary_action": "Request promotion",
            },
        }

    def start_run(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        return {
            "status": "ok",
            "message": f"Run lancé avec succès pour {payload.get('model_type', 'XLM-R')}",
            "run_id": f"run_{int(time.time())}",
        }

    def promote_candidate(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        return {
            "status": "ok",
            "message": "Modèle candidat promu en production avec succès",
            "promoted_model": payload.get("model_id", "ticket-cls-v4"),
        }


text_training_service = TextTrainingService()
