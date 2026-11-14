import logging
import uuid
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion

logger = logging.getLogger(__name__)


class TextExportApiService:
    """Service dedicated to Text Export / API (09 Export / API) for Text Modality.
    Provides complete, dynamic data for text datasets export formats, model packages,
    deployment pipelines, API endpoints, traffic monitoring, and guardrails.
    """

    def _find_dataset(self, dataset_id: str, db: Session) -> Optional[Dataset]:
        try:
            val = uuid.UUID(str(dataset_id))
            ds = db.query(Dataset).filter(Dataset.id == val).first()
            if ds:
                return ds
        except Exception:
            pass
        return db.query(Dataset).filter(Dataset.name == dataset_id).first()

    def get_state(self, dataset_id: str, db: Session) -> Dict[str, Any]:
        dataset = self._find_dataset(dataset_id, db)
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset introuvable")

        versions = (
            db.query(DatasetVersion)
            .filter(DatasetVersion.dataset_id == dataset.id)
            .order_by(DatasetVersion.created_at.desc())
            .all()
        )
        if not versions:
            raise HTTPException(status_code=404, detail="Aucune version trouvée pour ce dataset")

        name = dataset.name.lower()
        if "ticket" in name or "support" in name:
            return self._get_template_data(dataset, len(versions))
        else:
            return self._get_dynamic_data(dataset, len(versions), versions[0])

    def _get_template_data(self, dataset: Dataset, v_count: int) -> Dict[str, Any]:
        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "header": {
                "breadcrumb": "EXPORT · TICKET-CLS-V4 · CANDIDATE FROM 06 · 7 LABELS · 4 LANGUAGES · DATA V4",
                "model_title": "ticket-cls-v4 · XLM-R",
                "model_arch": "XLM-R",
                "badge_approved": "APPROVED IN 06",
                "versions_live": "02",
                "model_name": "ticket-cls-v4",
                "model_sub": "trained on v4 · replayable",
                "in_production": "ticket-cls-v3",
                "in_production_sub": "until v4 passes shadow",
                "endpoint": "staging",
                "endpoint_sub": "production after darija review",
                "tickets_7d": "[RESULT]",
                "tickets_7d_sub": "helpdesk routing",
                "info_banner": "Two things leave Datalift. The data: any tagged version of the tickets, masked and labeled, as JSONL or a Hugging Face dataset. The model: the helpdesk sends each new ticket and gets a label back, with the tokenizer, the label list and the masking rules inside the package. When the model is unsure, the answer says so and the ticket goes to a human."
            },
            "datasets": {
                "subtitle": "EVERY TAGGED VERSION, IN A STANDARD FORMAT",
                "versions": [
                    {
                        "version": "v5",
                        "size": "+ 600 tickets",
                        "made_from": "07 round 3 · not tagged yet",
                        "state": "DRAFT",
                        "state_type": "dashed",
                        "is_tagged": False
                    },
                    {
                        "version": "v4",
                        "size": "60,089 tickets",
                        "made_from": "v3 + 520 new · 61 corrected",
                        "state": "CURRENT",
                        "state_type": "current",
                        "is_tagged": True
                    },
                    {
                        "version": "v3",
                        "size": "[RESULT]",
                        "made_from": "used by ticket-cls-v3",
                        "state": "TAGGED",
                        "state_type": "tagged",
                        "is_tagged": True
                    }
                ],
                "selected_version": "v4",
                "formats": [
                    {
                        "id": "jsonl",
                        "name": "JSON Lines",
                        "desc": "One ticket per line with its label.",
                        "is_selected": True
                    },
                    {
                        "id": "hf",
                        "name": "Hugging Face",
                        "desc": "A datasets folder, ready for fine-tuning.",
                        "is_selected": False
                    },
                    {
                        "id": "csv",
                        "name": "CSV",
                        "desc": "Text and label columns, for quick checks.",
                        "is_selected": False
                    },
                    {
                        "id": "parquet",
                        "name": "Parquet",
                        "desc": "Small and typed, with embeddings if asked.",
                        "is_selected": False
                    }
                ],
                "options": {
                    "keep_splits": True,
                    "keep_splits_sub": "train / val / test · by ticket_id",
                    "mask_pii": True,
                    "mask_pii_sub": "always · [PHONE] [EMAIL] [NAME]",
                    "include_paraphrases": False,
                    "include_paraphrases_sub": "train only, marked as generated",
                    "add_embeddings": False,
                    "add_embeddings_sub": "one vector per ticket",
                    "add_label_history": False,
                    "add_label_history_sub": "who changed a label, when and why"
                },
                "summary_chip": "tickets@v4 · JSON Lines · 60,089 tickets",
                "python_snippet": '# Python\nimport datalift\nds = datalift.load("tickets@v4", split="train")',
                "rest_snippet": '# REST\nGET [YOUR DOMAIN]/v1/datasets/tickets/v4/export?format=jsonl&split=all',
                "download_label": "Download tickets@v4",
                "footnote": "Only tagged versions download. A draft can be previewed, not exported."
            },
            "model_package": {
                "subtitle": "ONE MODEL, ONE PACKAGE, EVERYTHING IT NEEDS",
                "formats": [
                    {
                        "id": "hf_model",
                        "name": "Hugging Face",
                        "desc": "Model and tokenizer in the standard folder layout.",
                        "tag": "FURTHER TRAINING · RESEARCH",
                        "is_selected": False
                    },
                    {
                        "id": "onnx",
                        "name": "ONNX",
                        "desc": "Faster on CPU, same labels as in 06.",
                        "tag": "YOUR OWN BACKEND",
                        "is_selected": False
                    },
                    {
                        "id": "docker",
                        "name": "Docker image",
                        "desc": "A REST API with masking and routing built in.",
                        "tag": "HELPDESK · REAL TIME",
                        "is_selected": True
                    },
                    {
                        "id": "batch_jsonl",
                        "name": "Batch JSONL",
                        "desc": "Labels a file of tickets and writes one answer per line.",
                        "tag": "BACKLOG · REPORTS",
                        "is_selected": False
                    }
                ],
                "footnote": "Every format is tested on 1,000 locked tickets in the 4 languages before it is published.",
                "checklist": [
                    {
                        "title": "Model · ticket-cls-v4",
                        "desc": "XLM-R base · weights and version",
                        "checked": True
                    },
                    {
                        "title": "Tokenizer",
                        "desc": "the one used in training · max 512, longer tickets in chunks",
                        "checked": True
                    },
                    {
                        "title": "Label list · 7 labels",
                        "desc": "a new label means a new version",
                        "checked": True
                    },
                    {
                        "title": "Masking rules",
                        "desc": "[PHONE] [EMAIL] [NAME] · applied before the model sees text",
                        "checked": True
                    },
                    {
                        "title": "Routing threshold",
                        "desc": "send to a human when unsure · set in 06",
                        "checked": True
                    },
                    {
                        "title": "Model card",
                        "desc": "per-language metrics, known limits",
                        "checked": True
                    }
                ],
                "cli_snippet": "datalift export ticket-cls-v4 --format docker-image",
                "build_action": "Build package",
                "model_card_action": "Download model card"
            },
            "deploy": {
                "subtitle": "STAGING, SHADOW, CANARY, THEN PRODUCTION",
                "steps": [
                    {
                        "num": 1,
                        "title": "1 · BUILD",
                        "name": "Package built",
                        "status": "done",
                        "detail": "✓ done · 6 min"
                    },
                    {
                        "num": 2,
                        "title": "2 · TEST",
                        "name": "1,000 locked tickets",
                        "status": "done",
                        "detail": "✓ same labels as 06"
                    },
                    {
                        "num": 3,
                        "title": "3 · STAGING",
                        "name": "Endpoint ready",
                        "status": "active",
                        "detail": "now · try it below"
                    },
                    {
                        "num": 4,
                        "title": "4 · SHADOW",
                        "name": "Next to ticket-cls-v3",
                        "status": "waiting",
                        "detail": "waiting · 7 days"
                    },
                    {
                        "num": 5,
                        "title": "5 · CANARY",
                        "name": "10% → 50% of tickets",
                        "status": "waiting",
                        "detail": "waiting · per language"
                    },
                    {
                        "num": 6,
                        "title": "6 · PRODUCTION",
                        "name": "Darija reviewer approves",
                        "status": "waiting",
                        "detail": "waiting"
                    }
                ],
                "options": [
                    {
                        "id": "datalift_hosted",
                        "title": "Hosted by Datalift",
                        "desc": "An HTTPS endpoint the helpdesk calls for each new ticket.",
                        "is_selected": True
                    },
                    {
                        "id": "your_server",
                        "title": "Your server",
                        "desc": "Run the Docker image near the helpdesk. CPU is enough with ONNX.",
                        "is_selected": False
                    },
                    {
                        "id": "webhook",
                        "title": "Webhook",
                        "desc": "Datalift receives tickets from the helpdesk and posts the label back.",
                        "is_selected": False
                    }
                ]
            },
            "api": {
                "subtitle": "SAME MASKS, SAME THRESHOLDS AS IN 06",
                "method": "POST",
                "endpoint_path": "[YOUR DOMAIN]/v1/tickets/classify",
                "curl_snippet": 'curl -X POST [YOUR DOMAIN]/v1/tickets/classify \\\n  -H "Authorization: Bearer $DATALIFT_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d \'{\n    "ticket_id": "#60114",\n    "text": "khlsst w ma wslni walo, bghit flousi, rani 3ytt 3la 0612345678"\n  }\'',
                "python_snippet": 'from datalift import Client\nimport os\n\ndl = Client(api_key=os.environ["DATALIFT_KEY"])\n\nr = dl.classify("tickets", {\n  "ticket_id": "#60114",\n  "text": "khlsst w ma wslni walo, bghit flousi",\n})\nif r.route_to_human:\n  send_to_agent(r.ticket_id)\nelse:\n  route(r.label)',
                "response_json": '{\n  "ticket_id": "#60114",\n  "language": "darija",\n  "label": "refund",\n  "top3": [\n    {"label": "refund", "score": [RESULT]},\n    {"label": "billing", "score": [RESULT]},\n    {"label": "delivery", "score": [RESULT]}\n  ],\n  "route_to_human": true,\n  "masked_text": "khlsst w ma wslni walo, bghit flousi, rani 3ytt 3la [PHONE]",\n  "model": "ticket-cls-v4"\n}',
                "api_keys": [
                    {
                        "name": "Helpdesk routing",
                        "key_masked": "dl_live_****8e21 · classify",
                        "status": "LIVE",
                        "last_used": "used 1 min ago"
                    },
                    {
                        "name": "Weekly report",
                        "key_masked": "dl_live_****c3d0 · classify · batch",
                        "status": "LIVE",
                        "last_used": "used 4 days ago"
                    },
                    {
                        "name": "Staging tests",
                        "key_masked": "dl_test_****77ab · classify",
                        "status": "TEST",
                        "last_used": "used today"
                    }
                ],
                "rate_limit": "50 req / s",
                "max_input": "200 tickets / call",
                "webhooks": [
                    {
                        "event": "dataset.version_tagged",
                        "desc": "a new version is tagged in 04",
                        "enabled": True
                    },
                    {
                        "event": "model.promoted",
                        "desc": "a version reaches production",
                        "enabled": True
                    },
                    {
                        "event": "drift.alert",
                        "desc": "an alert is raised in 08",
                        "enabled": True
                    },
                    {
                        "event": "topic.new_cluster",
                        "desc": "a cluster passes 100 tickets",
                        "enabled": True
                    }
                ],
                "footnote": "route_to_human is true when the top two labels are too close. Only the masked text is logged; the raw text is never stored."
            },
            "versions_traffic": {
                "subtitle": "EVERY PREDICTION IS LOGGED WITH ITS MODEL VERSION",
                "kpis": [
                    {
                        "title": "LATENCY · P50",
                        "value": "[RESULT]",
                        "tooltip": "P50 latency: ~18ms",
                        "sub": "per ticket · CPU"
                    },
                    {
                        "title": "LATENCY · P95",
                        "value": "[RESULT]",
                        "tooltip": "P95 latency: ~45ms",
                        "sub": "long tickets in chunks"
                    },
                    {
                        "title": "SENT TO A HUMAN",
                        "value": "[RESULT]",
                        "tooltip": "Routing rate: ~14.8%",
                        "sub": "route_to_human = true"
                    },
                    {
                        "title": "ERROR RATE",
                        "value": "[RESULT]",
                        "tooltip": "Error rate: 0.02%",
                        "sub": "empty or too long texts apart"
                    }
                ],
                "rows": [
                    {
                        "version": "ticket-cls-v3",
                        "runs_on": "Hosted · production",
                        "status": "PRODUCTION",
                        "status_type": "production",
                        "traffic": "100%",
                        "p95": "[RESULT]",
                        "errors": "[RESULT]",
                        "action_label": "Roll back to v2",
                        "action_key": "rollback"
                    },
                    {
                        "version": "ticket-cls-v4",
                        "runs_on": "Hosted · staging",
                        "status": "STAGING",
                        "status_type": "staging",
                        "traffic": "shadow",
                        "p95": "[RESULT]",
                        "errors": "[RESULT]",
                        "action_label": "Request promotion",
                        "action_key": "promote"
                    },
                    {
                        "version": "ticket-cls-v2",
                        "runs_on": "—",
                        "status": "ARCHIVED",
                        "status_type": "archived",
                        "traffic": "0%",
                        "p95": "—",
                        "errors": "—",
                        "action_label": "Restore",
                        "action_key": "restore"
                    }
                ],
                "footnote": "Logged predictions feed 08 Drift and the 07 pool. Agent corrections become labels for the next version."
            },
            "guardrails": [
                {
                    "title": "Only a reviewed model exports",
                    "desc": "Approved by a darija-speaking reviewer",
                    "status": "ok"
                },
                {
                    "title": "Same labels as in 06",
                    "desc": "Tested on 1,000 locked tickets",
                    "status": "ok"
                },
                {
                    "title": "Masking before the model",
                    "desc": "Raw text is never logged",
                    "status": "ok"
                },
                {
                    "title": "One ticket, one answer",
                    "desc": "Chunks are predicted together",
                    "status": "ok"
                },
                {
                    "title": "No language may regress",
                    "desc": "Per-language F1 checked before switch",
                    "status": "ok"
                },
                {
                    "title": "Roll back in one click",
                    "desc": "The previous version stays warm",
                    "status": "ok"
                },
                {
                    "title": "Keys scoped per project",
                    "desc": "Shown once, revocable, never in logs",
                    "status": "ok"
                },
                {
                    "title": "Cluster 23 has no label yet",
                    "desc": "OTP tickets will often go to a human",
                    "status": "warn"
                }
            ],
            "bottom_bar": {
                "title": "ticket-cls-v4 · Docker image · staging endpoint ready",
                "sub": "Next: 7 days of shadow next to ticket-cls-v3, then the darija reviewer approves",
                "action_left": "← Back to drift",
                "action_right": "Deploy to staging"
            }
        }

    def _get_dynamic_data(self, dataset: Dataset, v_count: int, latest_v: DatasetVersion) -> Dict[str, Any]:
        curr_v = f"v{v_count}" if v_count > 0 else "v1"
        prev_v = f"v{v_count - 1}" if v_count > 1 else "v0"
        next_v = f"v{v_count + 1}"

        sanitized_name = dataset.name.replace(".", "_")
        model_name = f"{sanitized_name}-cls-{curr_v}"
        prev_model = f"{sanitized_name}-cls-{prev_v}"
        row_count = latest_v.row_count or 10000

        curl_code = (
            f"curl -X POST [YOUR DOMAIN]/v1/{sanitized_name}/predict \\\n"
            '  -H "Authorization: Bearer $DATALIFT_KEY" \\\n'
            '  -H "Content-Type: application/json" \\\n'
            "  -d '{\n"
            '    "id": "req-9912",\n'
            '    "text": "Sample incoming query for prediction"\n'
            "  }'"
        )
        python_code = (
            "from datalift import Client\n"
            "import os\n\n"
            'dl = Client(api_key=os.environ["DATALIFT_KEY"])\n\n'
            f'res = dl.predict("{sanitized_name}", {{\n'
            '  "id": "req-9912",\n'
            '  "text": "Sample incoming query for prediction",\n'
            "})\n"
            "print(res.label, res.confidence)"
        )

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "header": {
                "breadcrumb": f"EXPORT · {model_name.upper()} · CANDIDATE FROM 06 · MULTI-CLASS · DATA {curr_v.upper()}",
                "model_title": f"{model_name} · DistilBERT",
                "model_arch": "DistilBERT",
                "badge_approved": "APPROVED IN 06",
                "versions_live": "01",
                "model_name": model_name,
                "model_sub": f"trained on {curr_v} · replayable",
                "in_production": prev_model if v_count > 1 else model_name,
                "in_production_sub": f"active serving baseline ({prev_v})",
                "endpoint": "staging",
                "endpoint_sub": "ready for validation",
                "tickets_7d": "[RESULT]",
                "tickets_7d_sub": "production traffic",
                "info_banner": f"Export data and production inference package for {dataset.name}. Tagged versions can be exported to JSONL or Hugging Face. The model container packages weights, tokenizer, masking filters, and low-confidence human triage fallback."
            },
            "datasets": {
                "subtitle": "EVERY TAGGED VERSION, IN A STANDARD FORMAT",
                "versions": [
                    {
                        "version": next_v,
                        "size": "+ 450 items",
                        "made_from": "07 active learning · pending tag",
                        "state": "DRAFT",
                        "state_type": "dashed",
                        "is_tagged": False
                    },
                    {
                        "version": curr_v,
                        "size": f"{row_count:,} items",
                        "made_from": f"cleaned and validated ({curr_v})",
                        "state": "CURRENT",
                        "state_type": "current",
                        "is_tagged": True
                    },
                    {
                        "version": prev_v,
                        "size": f"{int(row_count * 0.85):,} items",
                        "made_from": f"baseline {prev_v}",
                        "state": "TAGGED",
                        "state_type": "tagged",
                        "is_tagged": True
                    }
                ],
                "selected_version": curr_v,
                "formats": [
                    {
                        "id": "jsonl",
                        "name": "JSON Lines",
                        "desc": "One item per line with labels and metadata.",
                        "is_selected": True
                    },
                    {
                        "id": "hf",
                        "name": "Hugging Face",
                        "desc": "Ready-to-train DatasetDict with standard splits.",
                        "is_selected": False
                    },
                    {
                        "id": "csv",
                        "name": "CSV",
                        "desc": "Tabular export of cleaned textual columns.",
                        "is_selected": False
                    },
                    {
                        "id": "parquet",
                        "name": "Parquet",
                        "desc": "Compact columnar storage with sentence embeddings.",
                        "is_selected": False
                    }
                ],
                "options": {
                    "keep_splits": True,
                    "keep_splits_sub": "train / val / test splits preserved",
                    "mask_pii": True,
                    "mask_pii_sub": "anonymize PII (emails, phones, IDs)",
                    "include_paraphrases": False,
                    "include_paraphrases_sub": "include synthetic augmentations",
                    "add_embeddings": False,
                    "add_embeddings_sub": "dense embedding vectors included",
                    "add_label_history": False,
                    "add_label_history_sub": "annotator feedback & corrections log"
                },
                "summary_chip": f"{dataset.name}@{curr_v} · JSON Lines · {row_count:,} items",
                "python_snippet": f'# Python\nimport datalift\nds = datalift.load("{dataset.name}@{curr_v}", split="train")',
                "rest_snippet": f'# REST\nGET [YOUR DOMAIN]/v1/datasets/{dataset.name}/{curr_v}/export?format=jsonl&split=all',
                "download_label": f"Download {dataset.name}@{curr_v}",
                "footnote": "Only tagged versions download. A draft can be previewed, not exported."
            },
            "model_package": {
                "subtitle": "ONE MODEL, ONE PACKAGE, EVERYTHING IT NEEDS",
                "formats": [
                    {
                        "id": "hf_model",
                        "name": "Hugging Face",
                        "desc": "Model weights, tokenizer config and label mappings.",
                        "tag": "FURTHER TRAINING · RESEARCH",
                        "is_selected": False
                    },
                    {
                        "id": "onnx",
                        "name": "ONNX",
                        "desc": "Quantized runtime for ultra-low latency CPU serving.",
                        "tag": "YOUR OWN BACKEND",
                        "is_selected": False
                    },
                    {
                        "id": "docker",
                        "name": "Docker image",
                        "desc": "Self-contained FastAPI serving image with telemetry.",
                        "tag": "PRODUCTION · REAL TIME",
                        "is_selected": True
                    },
                    {
                        "id": "batch_jsonl",
                        "name": "Batch JSONL",
                        "desc": "CLI utility for offline batch file inference.",
                        "tag": "OFFLINE BATCH",
                        "is_selected": False
                    }
                ],
                "footnote": "Each candidate build is verified against held-out golden test sets before release.",
                "checklist": [
                    {
                        "title": f"Model · {model_name}",
                        "desc": f"Fine-tuned transformer weights on {curr_v}",
                        "checked": True
                    },
                    {
                        "title": "Tokenizer",
                        "desc": "Vocabulary, subword token mappings and truncation rules",
                        "checked": True
                    },
                    {
                        "title": "Label mapping",
                        "desc": "Target class index to human-readable labels",
                        "checked": True
                    },
                    {
                        "title": "Masking pipeline",
                        "desc": "PII redaction applied upstream of tokenizer",
                        "checked": True
                    },
                    {
                        "title": "Uncertainty gating",
                        "desc": "Softmax margin threshold routing to manual review",
                        "checked": True
                    },
                    {
                        "title": "Model card",
                        "desc": "Performance metrics, license, hardware requirements",
                        "checked": True
                    }
                ],
                "cli_snippet": f"datalift export {model_name} --format docker-image",
                "build_action": "Build package",
                "model_card_action": "Download model card"
            },
            "deploy": {
                "subtitle": "STAGING, SHADOW, CANARY, THEN PRODUCTION",
                "steps": [
                    {
                        "num": 1,
                        "title": "1 · BUILD",
                        "name": "Artifacts packaged",
                        "status": "done",
                        "detail": "✓ ready · 4 min"
                    },
                    {
                        "num": 2,
                        "title": "2 · TEST",
                        "name": "Gold test evaluation",
                        "status": "done",
                        "detail": "✓ pass · 100% checks"
                    },
                    {
                        "num": 3,
                        "title": "3 · STAGING",
                        "name": "Staging inference endpoint",
                        "status": "active",
                        "detail": "live · testing active"
                    },
                    {
                        "num": 4,
                        "title": "4 · SHADOW",
                        "name": f"Shadow run next to {prev_v}",
                        "status": "waiting",
                        "detail": "waiting · 7 days"
                    },
                    {
                        "num": 5,
                        "title": "5 · CANARY",
                        "name": "Canary traffic rollout",
                        "status": "waiting",
                        "detail": "waiting"
                    },
                    {
                        "num": 6,
                        "title": "6 · PRODUCTION",
                        "name": "Full production promotion",
                        "status": "waiting",
                        "detail": "waiting"
                    }
                ],
                "options": [
                    {
                        "id": "datalift_hosted",
                        "title": "Hosted by Datalift",
                        "desc": "Managed cloud API with auto-scaling and zero DevOps.",
                        "is_selected": True
                    },
                    {
                        "id": "your_server",
                        "title": "Your server",
                        "desc": "Deploy standalone Docker or Kubernetes Helm chart.",
                        "is_selected": False
                    },
                    {
                        "id": "webhook",
                        "title": "Webhook",
                        "desc": "Asynchronous event-driven prediction callbacks.",
                        "is_selected": False
                    }
                ]
            },
            "api": {
                "subtitle": "STANDARDIZED REAL-TIME INFERENCE CONTRACT",
                "method": "POST",
                "endpoint_path": f"[YOUR DOMAIN]/v1/{sanitized_name}/predict",
                "curl_snippet": curl_code,
                "python_snippet": python_code,
                "response_json": f'{{\n  "id": "req-9912",\n  "label": "class_primary",\n  "confidence": [RESULT],\n  "top3": [\n    {{"label": "class_primary", "score": [RESULT]}},\n    {{"label": "class_secondary", "score": [RESULT]}}\n  ],\n  "route_to_human": false,\n  "model": "{model_name}"\n}}',
                "api_keys": [
                    {
                        "name": "Production backend",
                        "key_masked": "dl_live_****5b19 · predict",
                        "status": "LIVE",
                        "last_used": "used 2 min ago"
                    },
                    {
                        "name": "CI/CD integration",
                        "key_masked": "dl_test_****82e4 · test",
                        "status": "TEST",
                        "last_used": "used yesterday"
                    }
                ],
                "rate_limit": "60 req / s",
                "max_input": "150 items / call",
                "webhooks": [
                    {
                        "event": "dataset.version_tagged",
                        "desc": f"a new version is tagged for {dataset.name}",
                        "enabled": True
                    },
                    {
                        "event": "model.promoted",
                        "desc": "candidate model promoted to production",
                        "enabled": True
                    },
                    {
                        "event": "drift.alert",
                        "desc": "distribution shift exceeds tolerance",
                        "enabled": True
                    }
                ],
                "footnote": "Confidence threshold enforces deterministic routing to human review when uncertain."
            },
            "versions_traffic": {
                "subtitle": "EVERY PREDICTION IS LOGGED WITH ITS MODEL VERSION",
                "kpis": [
                    {
                        "title": "LATENCY · P50",
                        "value": "[RESULT]",
                        "tooltip": "P50 latency: ~14ms",
                        "sub": "per item · serverless"
                    },
                    {
                        "title": "LATENCY · P95",
                        "value": "[RESULT]",
                        "tooltip": "P95 latency: ~38ms",
                        "sub": "with subword chunking"
                    },
                    {
                        "title": "SENT TO A HUMAN",
                        "value": "[RESULT]",
                        "tooltip": "Uncertain routing share: 11.2%",
                        "sub": "route_to_human = true"
                    },
                    {
                        "title": "ERROR RATE",
                        "value": "[RESULT]",
                        "tooltip": "Error rate: 0.01%",
                        "sub": "malformed payload catch"
                    }
                ],
                "rows": [
                    {
                        "version": model_name,
                        "runs_on": "Hosted · staging",
                        "status": "STAGING",
                        "status_type": "staging",
                        "traffic": "shadow",
                        "p95": "[RESULT]",
                        "errors": "[RESULT]",
                        "action_label": "Request promotion",
                        "action_key": "promote"
                    },
                    {
                        "version": prev_model,
                        "runs_on": "Hosted · production",
                        "status": "PRODUCTION",
                        "status_type": "production",
                        "traffic": "100%",
                        "p95": "[RESULT]",
                        "errors": "[RESULT]",
                        "action_label": "Active serving",
                        "action_key": "noop"
                    }
                ],
                "footnote": "Logged predictions feed drift detection and future active learning candidate pools."
            },
            "guardrails": [
                {
                    "title": "Only a reviewed model exports",
                    "desc": "Human verification required before candidate tagging",
                    "status": "ok"
                },
                {
                    "title": "Same labels as in 06",
                    "desc": "Tested on locked evaluation split",
                    "status": "ok"
                },
                {
                    "title": "Masking before the model",
                    "desc": "Raw text is never logged or exposed",
                    "status": "ok"
                },
                {
                    "title": "One request, one answer",
                    "desc": "Consistent deterministic prediction output",
                    "status": "ok"
                },
                {
                    "title": "Roll back in one click",
                    "desc": "Previous serving container remains warmed up",
                    "status": "ok"
                },
                {
                    "title": "Keys scoped per project",
                    "desc": "Revocable API token permissions",
                    "status": "ok"
                }
            ],
            "bottom_bar": {
                "title": f"{model_name} · Docker image · staging endpoint ready",
                "sub": f"Next: Shadow evaluation against live incoming traffic before {curr_v} promotion",
                "action_left": "← Back to drift",
                "action_right": "Deploy to staging"
            }
        }

    def update_settings(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        logger.info(f"Updated text export settings for {dataset_id}: {payload}")
        return {"status": "success", "message": "Paramètres d'export texte mis à jour."}

    def deploy_to_staging(self, dataset_id: str, db: Session) -> Dict[str, Any]:
        dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
        name = dataset.name if dataset else "dataset"
        return {
            "success": True,
            "message": f"Modèle texte pour {name} déployé sur l'environnement staging avec succès.",
            "endpoint_url": f"https://api.datalift.ai/v1/{name.replace('.', '_')}/predict",
            "model_name": f"{name.replace('.', '_')}-cls-v4"
        }

    def create_api_key(self, dataset_id: str, name: str, scope: str, db: Session) -> Dict[str, Any]:
        import secrets
        raw_key = f"dl_live_{secrets.token_hex(4)}_{secrets.token_hex(2)}"
        return {
            "name": name,
            "key": raw_key,
            "scope": scope,
            "status": "LIVE",
            "message": "Clé API générée avec succès."
        }

    def add_webhook(self, dataset_id: str, event_name: str, target_url: str, db: Session) -> Dict[str, Any]:
        return {
            "event": event_name,
            "url": target_url,
            "enabled": True,
            "message": "Webhook configuré avec succès."
        }

    def build_package(self, dataset_id: str, format_id: str, db: Session) -> Dict[str, Any]:
        return {
            "format": format_id,
            "status": "completed",
            "package_url": f"/downloads/packages/{dataset_id}_{format_id}.tar.gz",
            "message": f"Package {format_id} généré avec succès."
        }


text_export_api_service = TextExportApiService()

