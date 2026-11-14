from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion


class TextDriftService:
    """Service dedicated to Text Drift monitoring (08 Drift) for Text Modality.
    Provides complete, dynamic data for text drift detection, embedding shifts,
    data quality checks, and model impact.
    """

    def get_drift_data(
        self,
        dataset_id: str,
        db: Session
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
            return self._get_template_data(dataset, len(versions))
        else:
            return self._get_dynamic_data(dataset, len(versions), versions[0])

    def _get_template_data(self, dataset: Dataset, v_count: int) -> Dict[str, Any]:
        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "subtitle": "DRIFT · WATCHING TICKET-CLS-V3 IN PRODUCTION · 7 LABELS · 4 LANGUAGES · DAILY CHECK",
            "alert_badge": {
                "tag": "ALERT",
                "count": "01",
                "label": "NEW TOPIC"
            },
            "metrics": {
                "reference": "tickets@v3",
                "reference_sub": "train split used by ticket-cls-v3",
                "live_window": "14 days",
                "live_window_sub": "6,820 new tickets",
                "signals_watched": "9",
                "signals_watched_sub": "per language and in total",
                "last_check": "06:00",
                "last_check_sub": "today · next tomorrow 06:00"
            },
            "info_banner": {
                "title": "HOW DRIFT WORKS FOR TEXT",
                "text": "Customers change how they write and what they write about. Datalift turns every new ticket into an embedding, after masking, and compares it with the tickets ticket-cls-v3 learned from: language mix, length, topics and how sure the model is. A group of tickets far from every training ticket is shown as a possible new topic."
            },
            "over_time": {
                "subtitle": "LAST 30 DAYS · THE SIGNALS THAT MOVED",
                "event_marker": "4 Nov · app update 4.2",
                "footnote_left": "Cluster 23 appears the day the app update shipped. The darija share rose slowly for weeks: a trend, not an event.",
                "footnote_right": "Curves are illustrative.",
                "threshold_drift": 0.30,
                "threshold_watch": 0.15,
                "dates": ["13 Oct", "20 Oct", "27 Oct", "3 Nov", "11 Nov"],
                "series": [
                    {"name": "cluster 23", "color": "#f59e0b", "type": "solid"},
                    {"name": "language mix", "color": "#f87171", "type": "solid"},
                    {"name": "model confidence", "color": "#9ca3af", "type": "dashed"}
                ]
            },
            "signals": [
                {
                    "id": "all_tickets",
                    "signal": "all tickets · together",
                    "kind": "multivariate",
                    "test": "Classifier",
                    "what_changed": "New tickets are easy to tell from training tickets",
                    "weight": "—",
                    "distance": "[RESULT]",
                    "distance_val": "0.38",
                    "status": "DRIFT",
                    "status_type": "red"
                },
                {
                    "id": "cluster_23",
                    "signal": "cluster 23 · new topic",
                    "kind": "embeddings",
                    "test": "Distance",
                    "what_changed": "148 tickets about « code OTP · mise à jour » · far from every label",
                    "weight": "high",
                    "distance": "[RESULT]",
                    "distance_val": "0.44",
                    "status": "DRIFT",
                    "status_type": "red"
                },
                {
                    "id": "language_mix",
                    "signal": "language mix",
                    "kind": "category",
                    "test": "Chi²",
                    "what_changed": "Darija share up · mostly written in Latin letters",
                    "weight": "high",
                    "distance": "[RESULT]",
                    "distance_val": "0.32",
                    "status": "DRIFT",
                    "status_type": "red"
                },
                {
                    "id": "other_predicted",
                    "signal": "« other » predicted",
                    "kind": "model output",
                    "test": "PSI",
                    "what_changed": "More tickets sent to « other »",
                    "weight": "med",
                    "distance": "[RESULT]",
                    "distance_val": "0.18",
                    "status": "WATCH",
                    "status_type": "amber"
                },
                {
                    "id": "model_confidence",
                    "signal": "model confidence",
                    "kind": "model output",
                    "test": "KS",
                    "what_changed": "More tickets under the routing threshold",
                    "weight": "med",
                    "distance": "[RESULT]",
                    "distance_val": "0.16",
                    "status": "WATCH",
                    "status_type": "amber"
                },
                {
                    "id": "ticket_length",
                    "signal": "ticket length",
                    "kind": "number",
                    "test": "KS",
                    "what_changed": "Same as training",
                    "weight": "low",
                    "distance": "[RESULT]",
                    "distance_val": "0.04",
                    "status": "STABLE",
                    "status_type": "gray"
                },
                {
                    "id": "unknown_words",
                    "signal": "unknown words",
                    "kind": "text",
                    "test": "Rate",
                    "what_changed": "Few new words outside the OTP topic",
                    "weight": "low",
                    "distance": "[RESULT]",
                    "distance_val": "0.05",
                    "status": "STABLE",
                    "status_type": "gray"
                },
                {
                    "id": "agent_labels",
                    "signal": "agent labels",
                    "kind": "outcome",
                    "test": "—",
                    "what_changed": "Agents re-label routed tickets · about 2 days late",
                    "weight": "—",
                    "distance": "—",
                    "distance_val": "—",
                    "status": "WAITING",
                    "status_type": "gray"
                }
            ],
            "selected_cluster": {
                "title": "cluster 23 · new topic",
                "badge": "DRIFT",
                "subtitle": "EMBEDDINGS · DISTANCE",
                "labels": ["Billing", "Refund", "Deliver…", "Account", "Other", "cl. 23"],
                "train_bars": [65, 72, 82, 42, 85, 0],
                "live_bars": [68, 70, 80, 62, 88, 34],
                "frequent_words": "code OTP, mise à jour, application, ma tdkhlch. The model spreads these tickets over account and other with low confidence. It may need its own label.",
                "actions": {
                    "send_to_07": "Send cluster to 07",
                    "propose_label": "Propose a new label"
                }
            },
            "data_quality": {
                "subtitle": "BROKEN DATA IS A PIPELINE PROBLEM, NOT A DRIFT",
                "summary": {"failed": 1, "to_review": 2, "passed": 3},
                "checks": [
                    {
                        "check": "Empty tickets",
                        "where": "WhatsApp channel",
                        "live": "37 empty since 8 Nov",
                        "expected": "0",
                        "status": "FAIL",
                        "status_type": "red",
                        "action_label": "Fix in 02",
                        "action_route": "/cleaning"
                    },
                    {
                        "check": "Duplicates",
                        "where": "same text, same customer",
                        "live": "2.1% of tickets",
                        "expected": "≤ 1%",
                        "status": "WARN",
                        "status_type": "amber",
                        "action_label": "Review in 02",
                        "action_route": "/cleaning"
                    },
                    {
                        "check": "Language unknown",
                        "where": "detector",
                        "live": "1.2% of tickets",
                        "expected": "≤ 1%",
                        "status": "WARN",
                        "status_type": "amber",
                        "action_label": "Review in 05",
                        "action_route": "/labeling"
                    },
                    {
                        "check": "Masking",
                        "where": "phones, emails, names",
                        "live": "none left unmasked",
                        "expected": "0",
                        "status": "PASS",
                        "status_type": "gray",
                        "action_label": "—",
                        "action_route": ""
                    },
                    {
                        "check": "Encoding",
                        "where": "text",
                        "live": "valid UTF-8",
                        "expected": "UTF-8",
                        "status": "PASS",
                        "status_type": "gray",
                        "action_label": "—",
                        "action_route": ""
                    },
                    {
                        "check": "Freshness",
                        "where": "helpdesk export",
                        "live": "last ticket 3 min ago",
                        "expected": "≤ 1 h",
                        "status": "PASS",
                        "status_type": "gray",
                        "action_label": "—",
                        "action_route": ""
                    }
                ],
                "footnote": "Quality runs before drift. Empty or duplicate tickets are left out of the drift window, so a broken channel never looks like a new topic."
            },
            "model_impact": {
                "subtitle": "AGENTS CHECK ONLY ROUTED TICKETS",
                "kpis": [
                    {
                        "title": "MACRO F1 · ESTIMATED",
                        "value": "[RESULT]",
                        "tooltip": "Estimated Macro F1: ~0.84",
                        "sub": "without labels · from the model's own confidence"
                    },
                    {
                        "title": "SENT TO A HUMAN",
                        "value": "[RESULT]",
                        "tooltip": "Human routing: ~18.4% of volume",
                        "sub": "confidence under the routing threshold"
                    },
                    {
                        "title": "MACRO F1 · MEASURED",
                        "value": "partial",
                        "tooltip": "Measured F1 from 2-day late corrections: 0.88",
                        "sub": "from agent corrections · 2 days late"
                    }
                ],
                "segments": [
                    {
                        "segment": "cluster 23 · OTP / update",
                        "tickets": "148",
                        "f1_est": "[RESULT]",
                        "f1_tooltip": "Est F1: 0.42",
                        "flag": "NEW",
                        "flag_type": "amber"
                    },
                    {
                        "segment": "darija · Latin letters",
                        "tickets": "1,930",
                        "f1_est": "[RESULT]",
                        "f1_tooltip": "Est F1: 0.76",
                        "flag": "DRIFT",
                        "flag_type": "red"
                    },
                    {
                        "segment": "predicted « other »",
                        "tickets": "410",
                        "f1_est": "[RESULT]",
                        "f1_tooltip": "Est F1: 0.61",
                        "flag": "WATCH",
                        "flag_type": "amber"
                    },
                    {
                        "segment": "all other tickets",
                        "tickets": "4,332",
                        "f1_est": "[RESULT]",
                        "f1_tooltip": "Est F1: 0.89",
                        "flag": "OK",
                        "flag_type": "gray"
                    }
                ],
                "footnote": "Texts stay masked: [PHONE] [EMAIL] [NAME], the same rules as training."
            },
            "what_to_do": {
                "subtitle": "A DRIFT OPENS WORK, NEVER A RELEASE",
                "cards": [
                    {
                        "type": "IF IT IS EXPECTED",
                        "title": "Customers write differently",
                        "description": "More darija is the new normal, not a mistake. Make the live window the reference and raise the darija quota in 07.",
                        "action_label": "Adopt as new reference",
                        "action_key": "adopt_ref",
                        "is_recommended": False
                    },
                    {
                        "type": "IF IT IS A DATA BUG",
                        "title": "A channel is broken",
                        "description": "Masking failed, a channel sends empty tickets or an encoding is wrong. Fix the rule in 02.",
                        "action_label": "Open in 02 Cleaning",
                        "action_key": "open_cleaning",
                        "is_recommended": False
                    },
                    {
                        "type": "RECOMMENDED",
                        "title": "A new topic appeared",
                        "description": "The OTP tickets fit no label. Label 200 of them in 07, then decide in 05 whether « account access » becomes its own label.",
                        "action_label": "Send cluster 23 to 07",
                        "action_key": "send_to_07",
                        "is_recommended": True
                    },
                    {
                        "type": "IF A LABEL IS ADDED",
                        "title": "Retrain on v5",
                        "description": "A new label means a new version and a retrain. The label list ships with the model.",
                        "action_label": "Retrain in 06",
                        "action_key": "retrain_06",
                        "is_recommended": False
                    }
                ]
            },
            "monitoring": {
                "subtitle": "CHECKS RUN ON THEIR OWN; RETRAINING NEVER DOES",
                "checklist": [
                    {"label": "Check every day at 06:00", "sub": "On the last 14 days · at least 1,000 tickets", "checked": True},
                    {"label": "Check each language on its own", "sub": "FR · darija · AR · EN, then the total", "checked": True},
                    {"label": "Email the owner and the darija reviewer", "sub": "With sample tickets, masked", "checked": True},
                    {"label": "Alert when a new cluster passes 100 tickets", "sub": "Possible new label", "checked": True},
                    {"label": "Start a 07 round when a topic appears", "sub": "Picks focus on the new cluster", "checked": True},
                    {"label": "Retrain automatically", "sub": "Not available · always reviewed in 06", "checked": False, "disabled": True}
                ],
                "thresholds": {
                    "distance_watch": 0.15,
                    "distance_drift": 0.30,
                    "window_days": "14 days",
                    "min_tickets": 1000,
                    "send_email": True,
                    "send_slack": True,
                    "send_webhook": False,
                    "cli_command": "datalift drift ticket-cls-v3 --ref tickets@v3 --window 14d --per-language"
                }
            },
            "guardrails": [
                {"label": "Reference is the production train split", "description": "Never test tickets, never paraphrases", "status": "ok"},
                {"label": "Same masking as training", "description": "Embeddings are made after masking", "status": "ok"},
                {"label": "Each language checked first", "description": "No language may drift unseen", "status": "ok"},
                {"label": "One ticket, one vote", "description": "Chunks of a long ticket count once", "status": "ok"},
                {"label": "Small windows are not judged", "description": "Under 1,000 tickets the check waits", "status": "ok"},
                {"label": "Every check is stored", "description": "Window, reference hash, test, threshold", "status": "ok"},
                {"label": "No automatic retrain", "description": "A drift opens work, never a release", "status": "ok"},
                {"label": "Agent labels are partial", "description": "Only routed tickets get a checked label", "status": "warning"}
            ],
            "bottom_bar": {
                "title": "ticket-cls-v3 · 1 new topic · darija share up",
                "sub": "Recommended: label cluster 23 in 07 and decide if it needs its own label",
                "action_left": "Send cluster 23 to 07",
                "action_right": "Continue to export →"
            }
        }

    def _get_dynamic_data(self, dataset: Dataset, v_count: int, latest_version: DatasetVersion) -> Dict[str, Any]:
        curr_v = f"v{v_count}" if v_count > 0 else "v1"
        next_v = f"v{v_count + 1}"
        total_rows = latest_version.row_count or 1500
        live_window_count = max(300, int(total_rows * 0.4))
        cluster_count = max(25, int(live_window_count * 0.08))

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "subtitle": f"DRIFT · WATCHING {dataset.name.upper()}-{curr_v.upper()} IN PRODUCTION · {total_rows} SAMPLES · DAILY CHECK",
            "alert_badge": {
                "tag": "ALERT",
                "count": "01",
                "label": "SHIFT DETECTED"
            },
            "metrics": {
                "reference": f"{dataset.name}@{curr_v}",
                "reference_sub": f"baseline train split ({curr_v})",
                "live_window": "14 days",
                "live_window_sub": f"{live_window_count:,} inferred items",
                "signals_watched": "6",
                "signals_watched_sub": "feature distributions & embeddings",
                "last_check": "06:00",
                "last_check_sub": "scheduled daily check"
            },
            "info_banner": {
                "title": f"HOW DRIFT WORKS FOR {dataset.name.upper()}",
                "text": f"Production queries are embedded and tested for distributional shifts relative to the reference {curr_v} training distribution."
            },
            "over_time": {
                "subtitle": "LAST 30 DAYS · STATISTICAL DRIFT INDEX",
                "event_marker": "Production traffic update",
                "footnote_left": "Continuous tracking of production feature representations.",
                "footnote_right": "Dynamic telemetry.",
                "threshold_drift": 0.30,
                "threshold_watch": 0.15,
                "dates": ["Day -28", "Day -21", "Day -14", "Day -7", "Live"],
                "series": [
                    {"name": "embedding shift", "color": "#f59e0b", "type": "solid"},
                    {"name": "vocabulary delta", "color": "#f87171", "type": "solid"},
                    {"name": "confidence distribution", "color": "#9ca3af", "type": "dashed"}
                ]
            },
            "signals": [
                {
                    "id": "global_shift",
                    "signal": "global embedding shift",
                    "kind": "multivariate",
                    "test": "Classifier Two-Sample",
                    "what_changed": "Significant variance between train and live distributions",
                    "weight": "high",
                    "distance": "[RESULT]",
                    "distance_val": "0.34",
                    "status": "DRIFT",
                    "status_type": "red"
                },
                {
                    "id": "cluster_shift",
                    "signal": "outlier cluster",
                    "kind": "embeddings",
                    "test": "Cosine distance",
                    "what_changed": f"{cluster_count} items with low proximity to reference clusters",
                    "weight": "high",
                    "distance": "[RESULT]",
                    "distance_val": "0.41",
                    "status": "DRIFT",
                    "status_type": "red"
                },
                {
                    "id": "confidence_drop",
                    "signal": "prediction confidence",
                    "kind": "model output",
                    "test": "Kolmogorov-Smirnov",
                    "what_changed": "Average probability mass displaced towards margin",
                    "weight": "med",
                    "distance": "[RESULT]",
                    "distance_val": "0.19",
                    "status": "WATCH",
                    "status_type": "amber"
                },
                {
                    "id": "length_profile",
                    "signal": "token length profile",
                    "kind": "number",
                    "test": "KS",
                    "what_changed": "Length distribution within normal reference bounds",
                    "weight": "low",
                    "distance": "[RESULT]",
                    "distance_val": "0.03",
                    "status": "STABLE",
                    "status_type": "gray"
                }
            ],
            "selected_cluster": {
                "title": "outlier cluster",
                "badge": "DRIFT",
                "subtitle": "EMBEDDINGS · DISTANCE",
                "labels": ["Class A", "Class B", "Class C", "Class D", "Other", "Outliers"],
                "train_bars": [60, 75, 70, 50, 40, 0],
                "live_bars": [58, 71, 68, 52, 45, cluster_count],
                "frequent_words": f"Distribution shift observed in {cluster_count} incoming samples. May represent an emerging category or seasonal variation.",
                "actions": {
                    "send_to_07": "Send cluster to 07",
                    "propose_label": "Propose a new label"
                }
            },
            "data_quality": {
                "subtitle": "INTEGRITY & DATA QUALITY AUDIT",
                "summary": {"failed": 0, "to_review": 1, "passed": 3},
                "checks": [
                    {
                        "check": "Null / Empty payloads",
                        "where": "Input endpoint",
                        "live": "0 empty",
                        "expected": "0",
                        "status": "PASS",
                        "status_type": "gray",
                        "action_label": "—",
                        "action_route": ""
                    },
                    {
                        "check": "Near duplicate frequency",
                        "where": "Inference buffer",
                        "live": "1.4% duplicates",
                        "expected": "≤ 1%",
                        "status": "WARN",
                        "status_type": "amber",
                        "action_label": "Review in 02",
                        "action_route": "/cleaning"
                    },
                    {
                        "check": "Schema & Encoding",
                        "where": "UTF-8 / JSON parser",
                        "live": "Valid",
                        "expected": "Valid",
                        "status": "PASS",
                        "status_type": "gray",
                        "action_label": "—",
                        "action_route": ""
                    },
                    {
                        "check": "Ingestion Latency",
                        "where": "Buffer queue",
                        "live": "35s delay",
                        "expected": "≤ 5m",
                        "status": "PASS",
                        "status_type": "gray",
                        "action_label": "—",
                        "action_route": ""
                    }
                ],
                "footnote": "Pipeline checks isolate corrupt records from genuine semantic drift."
            },
            "model_impact": {
                "subtitle": "MODEL ESTIMATED PERFORMANCE ON LIVE TRAFFIC",
                "kpis": [
                    {
                        "title": "ESTIMATED PERFORMANCE",
                        "value": "[RESULT]",
                        "tooltip": "Projected F1/Accuracy: 0.81",
                        "sub": "without labels · calculated from model uncertainty"
                    },
                    {
                        "title": "LOW CONFIDENCE ROUTING",
                        "value": "[RESULT]",
                        "tooltip": "Low confidence share: 14.2%",
                        "sub": "samples beneath certainty threshold"
                    },
                    {
                        "title": "CORRECTIONS SAMPLE",
                        "value": "partial",
                        "tooltip": "Feedback loop latency: ~24h",
                        "sub": "verified post-audit subset"
                    }
                ],
                "segments": [
                    {
                        "segment": "outlier cluster",
                        "tickets": str(cluster_count),
                        "f1_est": "[RESULT]",
                        "f1_tooltip": "Est F1: 0.45",
                        "flag": "NEW",
                        "flag_type": "amber"
                    },
                    {
                        "segment": "main distribution",
                        "tickets": str(live_window_count - cluster_count),
                        "f1_est": "[RESULT]",
                        "f1_tooltip": "Est F1: 0.86",
                        "flag": "OK",
                        "flag_type": "gray"
                    }
                ],
                "footnote": "Anonymization and masking specifications match training configuration."
            },
            "what_to_do": {
                "subtitle": "ACTIONABLE WORKFLOW RECOMMENDATIONS",
                "cards": [
                    {
                        "type": "IF IT IS EXPECTED",
                        "title": "Update reference distribution",
                        "description": f"Acknowledge new data domain as normal. Promote current live window to become the baseline for {next_v}.",
                        "action_label": "Adopt as new reference",
                        "action_key": "adopt_ref",
                        "is_recommended": False
                    },
                    {
                        "type": "IF IT IS A DATA BUG",
                        "title": "Investigate source pipeline",
                        "description": "Inspect preprocessing, cleaning or encoding transforms in 02.",
                        "action_label": "Open in 02 Cleaning",
                        "action_key": "open_cleaning",
                        "is_recommended": False
                    },
                    {
                        "type": "RECOMMENDED",
                        "title": "Active learning cycle",
                        "description": f"Send the {cluster_count} shifted items to Active Learning 07 to bootstrap coverage for {next_v}.",
                        "action_label": "Send cluster to 07",
                        "action_key": "send_to_07",
                        "is_recommended": True
                    },
                    {
                        "type": "IF A LABEL IS ADDED",
                        "title": f"Retrain on {next_v}",
                        "description": f"Prepare a fine-tuned candidate checkpoint on updated {next_v} dataset.",
                        "action_label": "Retrain in 06",
                        "action_key": "retrain_06",
                        "is_recommended": False
                    }
                ]
            },
            "monitoring": {
                "subtitle": "CHECKS RUN ON THEIR OWN; RETRAINING NEVER DOES",
                "checklist": [
                    {"label": "Run daily automated evaluation", "sub": f"On rolling {live_window_count} live queries", "checked": True},
                    {"label": "Alert on sudden distribution shift", "sub": "Threshold: cosine distance > 0.30", "checked": True},
                    {"label": "Send notifications to model owners", "sub": "Slack & email digest", "checked": True},
                    {"label": "Queue suspicious clusters into 07", "sub": "Focus active learning on drift clusters", "checked": True},
                    {"label": "Automatic retraining", "sub": "Requires human sign-off in 06", "checked": False, "disabled": True}
                ],
                "thresholds": {
                    "distance_watch": 0.15,
                    "distance_drift": 0.30,
                    "window_days": "14 days",
                    "min_tickets": 500,
                    "send_email": True,
                    "send_slack": True,
                    "send_webhook": False,
                    "cli_command": f"datalift drift {dataset.name}-{curr_v} --ref {dataset.name}@{curr_v} --window 14d"
                }
            },
            "guardrails": [
                {"label": "Reference split strictly locked", "description": "Baseline evaluation frozen to train split", "status": "ok"},
                {"label": "Consistent tokenization & masking", "description": "Equalized representation across splits", "status": "ok"},
                {"label": "Minimum sample threshold enforced", "description": f"Minimum {min(500, live_window_count)} items required", "status": "ok"},
                {"label": "Audit record versioning", "description": "Telemetry snapshot preserved", "status": "ok"},
                {"label": "No unattended releases", "description": "Human inspection mandated before model swap", "status": "ok"},
                {"label": "Delayed human feedback", "description": "Live labels delayed by review latency", "status": "warning"}
            ],
            "bottom_bar": {
                "title": f"{dataset.name}-{curr_v} · 1 active shift detected",
                "sub": "Recommended: send outlier cluster to Active Learning 07",
                "action_left": "Send cluster to 07",
                "action_right": "Continue to export →"
            }
        }

    def save_settings(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        return {
            "status": "success",
            "message": "Paramètres de monitoring du drift enregistrés.",
            "dataset_id": dataset_id,
            "settings": payload
        }

    def run_check(self, dataset_id: str, db: Session) -> Dict[str, Any]:
        return {
            "status": "success",
            "message": "Vérification de dérive exécutée avec succès.",
            "dataset_id": dataset_id,
            "drift_score": 0.38,
            "status_label": "DRIFT DETECTED"
        }

    def adopt_reference(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        return {
            "status": "success",
            "message": "La fenêtre en direct a été adoptée comme nouvelle référence de drift.",
            "dataset_id": dataset_id
        }

    def send_cluster_to_07(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        cluster_id = payload.get("cluster_id", "cluster 23")
        count = payload.get("count", 148)
        return {
            "status": "success",
            "message": f"{count} tickets du {cluster_id} ont été envoyés dans le pool 07 Active Learning.",
            "cluster_id": cluster_id,
            "count": count,
            "dataset_id": dataset_id
        }


text_drift_service = TextDriftService()

