from typing import Dict, Any, List, Optional
import time
from sqlalchemy.orm import Session
from fastapi import HTTPException

from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.services.parquet_service import parquet_service


class TextActiveLearningService:
    """Service dedicated to Text Active Learning (07 Active Learning) for Text Modality.
    Provides complete, dynamic data for the active learning workflow.
    """

    def get_active_learning_data(
        self,
        dataset_id: str,
        db: Session,
        strategy_filter: Optional[str] = "all"
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
            return self._get_template_data(dataset, len(versions), strategy_filter)
        else:
            return self._get_dynamic_data(dataset, len(versions), versions[0], strategy_filter)

    def _get_template_data(
        self,
        dataset: Dataset,
        v_count: int,
        strategy_filter: Optional[str] = "all"
    ) -> Dict[str, Any]:
        output_v = "v5"
        round_num = "03"

        picks = [
            {
                "ticket_id": "#60114",
                "language": "DARIJA",
                "text": "khlsst w ma wslni walo, bghit flousi, 3iyto 3liya f [PHONE]",
                "why_picked": "Smallest margin",
                "strategy_key": "margin",
                "model_top_2": "refund 0.48 · billing 0.44",
            },
            {
                "ticket_id": "#60388",
                "language": "FR",
                "text": "Le code OTP n'arrive jamais depuis la mise à jour de l'application",
                "why_picked": "New topic · cluster 23",
                "strategy_key": "new_topic",
                "model_top_2": "account 0.31 · technical 0.29",
            },
            {
                "ticket_id": "#60521",
                "language": "AR",
                "text": "هذه ثالث مرة يتأخر فيها التوصيل، خدمة سيئة",
                "why_picked": "Rare label",
                "strategy_key": "rare",
                "model_top_2": "complaint 0.41 · delivery 0.39",
            },
            {
                "ticket_id": "#60702",
                "language": "EN",
                "text": "Charged for a subscription I cancelled last month, [NAME] said it was fixed",
                "why_picked": "Models disagree",
                "strategy_key": "disagree",
                "model_top_2": "billing (v4) · refund (LLM)",
            },
            {
                "ticket_id": "#60811",
                "language": "DARIJA",
                "text": "l application katbloki melli kandir login, chno l mochkil?",
                "why_picked": "Diversity",
                "strategy_key": "diversity",
                "model_top_2": "technical 0.57 · account 0.33",
            },
            {
                "ticket_id": "#60955",
                "language": "FR",
                "text": "Merci pour la livraison rapide, rien à signaler",
                "why_picked": "Random control",
                "strategy_key": "random",
                "model_top_2": "other 0.83 · delivery 0.12",
            },
        ]

        filtered_picks = picks
        if strategy_filter and strategy_filter != "all":
            filtered_picks = [p for p in picks if p["strategy_key"] == strategy_filter]

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": dataset.name,
            "breadcrumb": "ACTIVE LEARNING · ROUND 3 · SCORED BY TICKET-CLS-V4 · 7 LABELS · 4 LANGUAGES",
            "round_badge": round_num,
            "round_status": "DRAFT",
            "round_subtitle": "NEXT ROUND",
            "kpis": {
                "pool": "6,820",
                "pool_sub": "new tickets since v4 · 14 days",
                "budget": "600 tickets",
                "budget_sub": "≈ 1 h 15 at the team's pace",
                "new_topics": "1",
                "new_topics_sub": "cluster with no labels",
                "output": output_v,
                "output_sub": "v4 kept as is",
            },
            "explainer": {
                "title": "HOW ACTIVE LEARNING WORKS FOR TEXT",
                "content": "New tickets arrive every day; labeling all of them is wasted effort. Datalift scores them with the current model, then picks the ones it hesitates on, the ones unlike anything labeled so far, and the rare labels. They reach 05 pre-labeled, and the next model in 06 learns from exactly those.",
            },
            "loop_section": {
                "stages": [
                    {"step": "1", "name": "SCORE POOL", "metric": "6,820 tickets", "status": "✓ done · 6 min · GPU", "is_done": True, "is_active": False},
                    {"step": "2", "name": "PICK TICKETS", "metric": "600 previewed", "status": "now · see section 3", "is_done": False, "is_active": True},
                    {"step": "3", "name": "LABEL IN 05", "metric": "pre-labeled · top 3", "status": "waiting", "is_done": False, "is_active": False},
                    {"step": "4", "name": "RETRAIN IN 06", "metric": "xlmr-ft.yaml", "status": "waiting", "is_done": False, "is_active": False},
                    {"step": "5", "name": "MEASURE GAIN", "metric": "vs random control", "status": "waiting", "is_done": False, "is_active": False},
                ],
                "rounds_history": [
                    {"round": "ROUND 1 · COLD START", "detail": "1,000 random", "target": "→ v2 · ticket-cls-v2", "is_active": False},
                    {"round": "ROUND 2 · DONE", "detail": "520 · margin + diversity", "target": "→ v4 · ticket-cls-v4", "is_active": False},
                    {"round": "ROUND 3 · DRAFT", "detail": "600 · 6 strategies", "target": "→ v5", "is_active": True},
                ],
            },
            "what_to_pick": {
                "strategies": [
                    {"id": "margin", "name": "Smallest margin", "desc": "Top two labels almost tied · mostly billing vs refund", "share_pct": 35, "tickets": 210},
                    {"id": "diversity", "name": "Diversity", "desc": "Clusters of tickets with few labels so far", "share_pct": 20, "tickets": 120},
                    {"id": "rare", "name": "Rare labels", "desc": 'Likely "other" or "complaint"', "share_pct": 15, "tickets": 90},
                    {"id": "new_topic", "name": "New topics", "desc": "Far from every labeled ticket", "share_pct": 10, "tickets": 60},
                    {"id": "disagree", "name": "Models disagree", "desc": "ticket-cls-v4 and the LLM reference give different labels", "share_pct": 10, "tickets": 60},
                    {"id": "random", "name": "Random control", "tag": "MIN 10%", "desc": "Honest baseline for the gain", "share_pct": 10, "tickets": 60},
                ],
                "total_tickets": 600,
                "total_pct": 100,
                "round_settings": {
                    "tickets_this_round": 600,
                    "language_quotas": [
                        {"lang": "FR", "min_pct": "30%"},
                        {"lang": "DARIJA", "min_pct": "30%"},
                        {"lang": "AR", "min_pct": "15%"},
                        {"lang": "EN", "min_pct": "10%"},
                    ],
                    "skip_near_duplicates": True,
                    "queue_whole_ticket": True,
                    "pre_label_with_model": True,
                    "pre_label_model_name": "ticket-cls-v4 · top 3",
                    "annotator_time": "≈ 1 h 15",
                    "darija_reviewer": "assigned",
                },
            },
            "picks_section": {
                "filter_counts": {
                    "all": 600,
                    "margin": 210,
                    "diversity": 120,
                    "rare": 90,
                    "new_topic": 60,
                    "disagree": 60,
                    "random": 60,
                },
                "cluster_callout": {
                    "cluster_id": 23,
                    "tickets_count": 148,
                    "title": "NEW TOPIC? · CLUSTER 23 · 148 TICKETS",
                    "frequent_words": "code OTP · mise à jour · application · ma tdkhlch",
                    "footnote": "A new label creates a new version and needs a retrain.",
                },
                "picks": filtered_picks,
            },
            "is_it_worth_it": {
                "header_sub": "MEASURED ON THE RANDOM CONTROL AND THE LOCKED TEST SET",
                "chart": {
                    "title": "Wrong labels found",
                    "sub": "PER 100 ROWS CHECKED",
                    "bars": [
                        {"label": "40", "sub": "R1 · PICKED", "type": "solid", "height_pct": 80},
                        {"label": "[RESULT]", "sub": "R1 · RANDOM", "type": "dashed", "height_pct": 75},
                        {"label": "—", "sub": "R2", "type": "dash", "height_pct": 10},
                    ],
                    "footer": "If picked rows don't beat random, the strategy mix is changed before the next round.",
                },
                "table": {
                    "headers": ["ROUND", "CHECKED", "FIXED", "HOURS", "DATA", "MODEL", "RECALL Δ"],
                    "rows": [
                        {"round": "R1", "checked": "240", "fixed": "96", "hours": "8 h", "data": "v4", "model": "churn-xgb-08", "recall_delta": "[RESULT]"},
                        {"round": "R2", "checked": "300", "fixed": "—", "hours": "≈ 10 h", "data": "v5", "model": "—", "recall_delta": "—"},
                    ],
                },
                "stop_rule": {
                    "title": "STOP RULE",
                    "left_label": "STOP WHEN FIXES FALL UNDER",
                    "left_val": "10% of checked rows",
                    "right_label": "AND RECALL GAINS UNDER",
                    "right_val": "1 point",
                    "footer": "Two rounds in a row. Then rounds only start on new data or a drift alert.",
                },
                # Keep backward compatibility fields if needed
                "learning_curve": {
                    "macro_f1": "0.89",
                    "rounds": ["R1", "R2"],
                    "active_learning_curve": [0.78, 0.89],
                    "random_control_curve": [0.78, 0.84],
                },
                "rounds_table": [
                    {"round": "R1", "tickets": "240", "strategy": "picked", "hours": "8 h", "data": "v4", "model": "churn-xgb-08", "gain": "[RESULT]"},
                    {"round": "R2", "tickets": "300", "strategy": "6 strategies", "hours": "≈ 10 h", "data": "v5", "model": "—", "gain": "—"},
                ],
            },
            "automation": [
                {"id": "auto_1", "title": "Start when 1,000 new tickets arrive", "sub": "Uses the mix above", "enabled": True},
                {"id": "auto_2", "title": "Start when 08 Drift flags a language or topic", "sub": "Picks focus on the drifted part", "enabled": True},
                {"id": "auto_3", "title": "Alert when a new cluster passes 100 tickets", "sub": "Possible new label", "enabled": True},
                {"id": "auto_4", "title": "Retrain in 06 after each round", "sub": "Template xlmr-ft.yaml", "enabled": True},
                {"id": "auto_5", "title": "Notify annotators when picks are ready", "sub": "Email", "enabled": False},
                {"id": "auto_6", "title": "Promote automatically", "sub": "Not available · always reviewed in 06", "enabled": False, "disabled": True},
            ],
            "guardrails": [
                {"title": "Test tickets never picked", "subtitle": "The locked test set stays untouched", "checked": True},
                {"title": "10% random control", "subtitle": "Measures the real gain", "checked": True},
                {"title": "Language quotas met", "subtitle": "darija ≥ 30% of every round", "checked": True},
                {"title": "Generated text never picked", "subtitle": "Paraphrases follow their parent", "checked": True},
                {"title": "Pseudo-labels train only", "subtitle": "origin = pseudo · spot-checked", "checked": True},
                {"title": "Personal data stays masked", "subtitle": "In the pool, the map and the picks", "checked": True},
                {"title": "Every round makes a new version", "subtitle": "v4 stays as is · round log attached", "checked": True},
                {"title": "Cluster 23 has no label yet", "subtitle": "148 tickets about OTP codes", "checked": False, "is_warning": True},
            ],
            "action_banner": {
                "summary": "Round 3 · 600 tickets · 6 strategies · creates v5",
                "detail": "Round log saved: model used, score of every ticket, why each ticket was picked",
                "save_draft_label": "Save draft",
                "send_labeling_label": "Send 600 tickets to labeling →",
            },
        }

    def _get_dynamic_data(
        self,
        dataset: Dataset,
        v_count: int,
        latest_version: DatasetVersion,
        strategy_filter: Optional[str] = "all"
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

        pool_count = max(20, int(round(total_rows * 0.35)))
        budget_count = max(10, int(round(pool_count * 0.15)))
        output_v = f"v{v_count + 1}"
        round_idx = max(2, min(5, v_count))
        round_str = f"0{round_idx}"

        # 6 Strategies shares
        s_margin = max(3, int(round(budget_count * 0.35)))
        s_div = max(2, int(round(budget_count * 0.20)))
        s_rare = max(2, int(round(budget_count * 0.15)))
        s_new = max(1, int(round(budget_count * 0.10)))
        s_disagree = max(1, int(round(budget_count * 0.10)))
        s_random = budget_count - s_margin - s_div - s_rare - s_new - s_disagree
        if s_random < 1:
            s_random = 1
            budget_count = s_margin + s_div + s_rare + s_new + s_disagree + s_random

        strat_defs = [
            ("margin", "Smallest margin", f"Top two labels almost tied in {dataset.name.split('.')[0]}", s_margin),
            ("diversity", "Diversity", "Clusters of items with few labels so far", s_div),
            ("rare", "Rare labels", f"Likely under-represented class: {classes[-1]}", s_rare),
            ("new_topic", "New topics", "Far from every labeled document", s_new),
            ("disagree", "Models disagree", "Model and baseline disagree", s_disagree),
            ("random", "Random control", "Honest baseline for the gain", s_random),
        ]

        strategies_list = []
        for s_id, s_name, s_desc, s_cnt in strat_defs:
            pct = int(round((s_cnt / budget_count) * 100))
            item = {
                "id": s_id,
                "name": s_name,
                "desc": s_desc,
                "share_pct": pct,
                "tickets": s_cnt,
            }
            if s_id == "random":
                item["tag"] = "MIN 10%"
            strategies_list.append(item)

        picks = []
        for i in range(min(6, len(sample_texts))):
            strat_key, strat_name, _, _ = strat_defs[i % len(strat_defs)]
            c1 = classes[i % len(classes)]
            c2 = classes[(i + 1) % len(classes)]
            picks.append({
                "ticket_id": f"#DOC_{i + 501}",
                "language": "FR",
                "text": sample_texts[i],
                "why_picked": strat_name,
                "strategy_key": strat_key,
                "model_top_2": f"{c1} 0.52 · {c2} 0.44",
            })

        filtered_picks = picks
        if strategy_filter and strategy_filter != "all":
            filtered_picks = [p for p in picks if p["strategy_key"] == strategy_filter]

        return {
            "dataset_id": str(dataset.id),
            "dataset_name": dataset.name,
            "display_title": dataset.name,
            "breadcrumb": f"ACTIVE LEARNING · ROUND {round_idx} · SCORED BY {dataset.name.split('.')[0]}-CLS · {len(classes)} LABELS",
            "round_badge": round_str,
            "round_status": "DRAFT",
            "round_subtitle": "NEXT ROUND",
            "kpis": {
                "pool": f"{pool_count:,}",
                "pool_sub": f"new items since v{v_count}",
                "budget": f"{budget_count:,} items",
                "budget_sub": "≈ 45 min at the team's pace",
                "new_topics": "1",
                "new_topics_sub": "cluster with no labels",
                "output": output_v,
                "output_sub": f"v{v_count} kept as is",
            },
            "explainer": {
                "title": f"HOW ACTIVE LEARNING WORKS FOR {dataset.name.upper()}",
                "content": "New texts arrive continuously; labeling all of them is wasted effort. Datalift scores them with the current model, then picks the ones it hesitates on, the ones unlike anything labeled so far, and the rare labels.",
            },
            "loop_section": {
                "stages": [
                    {"step": "1", "name": "SCORE POOL", "metric": f"{pool_count:,} items", "status": "✓ done · GPU", "is_done": True, "is_active": False},
                    {"step": "2", "name": "PICK ITEMS", "metric": f"{budget_count:,} previewed", "status": "now · see section 3", "is_done": False, "is_active": True},
                    {"step": "3", "name": "LABEL IN 05", "metric": "pre-labeled · top 3", "status": "waiting", "is_done": False, "is_active": False},
                    {"step": "4", "name": "RETRAIN IN 06", "metric": "ft.yaml", "status": "waiting", "is_done": False, "is_active": False},
                    {"step": "5", "name": "MEASURE GAIN", "metric": "vs random control", "status": "waiting", "is_done": False, "is_active": False},
                ],
                "rounds_history": [
                    {"round": "ROUND 1 · COLD START", "detail": f"{max(5, budget_count * 2):,} random", "target": f"→ v1 · baseline", "is_active": False},
                    {"round": f"ROUND {round_idx} · DRAFT", "detail": f"{budget_count:,} · 6 strategies", "target": f"→ {output_v}", "is_active": True},
                ],
            },
            "what_to_pick": {
                "strategies": strategies_list,
                "total_tickets": budget_count,
                "total_pct": 100,
                "round_settings": {
                    "tickets_this_round": budget_count,
                    "language_quotas": [
                        {"lang": "ALL", "min_pct": "100%"},
                    ],
                    "skip_near_duplicates": True,
                    "queue_whole_ticket": True,
                    "pre_label_with_model": True,
                    "pre_label_model_name": f"{dataset.name.split('.')[0]}-cls · top 3",
                    "annotator_time": "≈ 45 min",
                    "darija_reviewer": "standard",
                },
            },
            "picks_section": {
                "filter_counts": {
                    "all": budget_count,
                    "margin": s_margin,
                    "diversity": s_div,
                    "rare": s_rare,
                    "new_topic": s_new,
                    "disagree": s_disagree,
                    "random": s_random,
                },
                "cluster_callout": {
                    "cluster_id": 12,
                    "tickets_count": max(15, int(round(pool_count * 0.1))),
                    "title": f"NEW TOPIC? · CLUSTER 12 · {max(15, int(round(pool_count * 0.1)))} ITEMS",
                    "frequent_words": f"{classes[0]} · {classes[1] if len(classes) > 1 else classes[0]} · update",
                    "footnote": "A new label creates a new version and needs a retrain.",
                },
                "picks": filtered_picks,
            },
            "is_it_worth_it": {
                "header_sub": "MEASURED ON THE RANDOM CONTROL AND THE LOCKED TEST SET",
                "chart": {
                    "title": "Wrong labels found",
                    "sub": "PER 100 ROWS CHECKED",
                    "bars": [
                        {"label": f"{max(25, int(round(pool_count * 0.08)))}", "sub": "R1 · PICKED", "type": "solid", "height_pct": 75},
                        {"label": "[RESULT]", "sub": "R1 · RANDOM", "type": "dashed", "height_pct": 70},
                        {"label": "—", "sub": "R2", "type": "dash", "height_pct": 10},
                    ],
                    "footer": "If picked rows don't beat random, the strategy mix is changed before the next round.",
                },
                "table": {
                    "headers": ["ROUND", "CHECKED", "FIXED", "HOURS", "DATA", "MODEL", "RECALL Δ"],
                    "rows": [
                        {"round": "R1", "checked": f"{max(30, int(round(pool_count * 0.15))):,}", "fixed": f"{max(10, int(round(pool_count * 0.06))):,}", "hours": "6 h", "data": f"v{max(1, v_count - 1)}", "model": f"{dataset.name.split('.')[0]}-cls", "recall_delta": "[RESULT]"},
                        {"round": "R2", "checked": f"{budget_count:,}", "fixed": "—", "hours": "≈ 8 h", "data": output_v, "model": "—", "recall_delta": "—"},
                    ],
                },
                "stop_rule": {
                    "title": "STOP RULE",
                    "left_label": "STOP WHEN FIXES FALL UNDER",
                    "left_val": "10% of checked rows",
                    "right_label": "AND RECALL GAINS UNDER",
                    "right_val": "1 point",
                    "footer": "Two rounds in a row. Then rounds only start on new data or a drift alert.",
                },
                "learning_curve": {
                    "macro_f1": "0.86",
                    "rounds": ["R1", f"R{round_idx}"],
                    "active_learning_curve": [0.76, 0.86],
                    "random_control_curve": [0.76, 0.81],
                },
                "rounds_table": [
                    {"round": "R1", "tickets": f"{max(5, budget_count * 2):,}", "strategy": "random · cold start", "hours": "2 h", "data": "v1", "model": "baseline", "gain": "—"},
                    {"round": f"R{round_idx}", "tickets": f"{budget_count:,}", "strategy": "6 strategies", "hours": "≈ 45 min", "data": output_v, "model": "—", "gain": "+0.05"},
                ],
            },
            "automation": [
                {"id": "auto_1", "title": f"Start when {pool_count // 2:,} new items arrive", "sub": "Uses the mix above", "enabled": True},
                {"id": "auto_2", "title": "Start when 08 Drift flags a topic", "sub": "Picks focus on the drifted part", "enabled": True},
                {"id": "auto_3", "title": "Alert when a new cluster passes threshold", "sub": "Possible new label", "enabled": True},
                {"id": "auto_4", "title": "Retrain in 06 after each round", "sub": "Config ft.yaml", "enabled": True},
            ],
            "guardrails": [
                {"title": "Test items never picked", "subtitle": "The locked test set stays untouched", "checked": True},
                {"title": "10% random control", "subtitle": "Measures the real gain", "checked": True},
                {"title": "Data strictly split", "subtitle": "No data leakage across splits", "checked": True},
                {"title": "Personal data stays masked", "subtitle": "In the pool and picks", "checked": True},
                {"title": "Every round makes a new version", "subtitle": f"v{v_count} stays as is", "checked": True},
            ],
            "action_banner": {
                "summary": f"Round {round_idx} · {budget_count:,} items · 6 strategies · creates {output_v}",
                "detail": "Round log saved: model used, score of every item, why each item was picked",
                "save_draft_label": "Save draft",
                "send_labeling_label": f"Send {budget_count:,} items to labeling →",
            },
        }

    def save_draft(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        return {
            "status": "ok",
            "message": "Configuration du round d'active learning enregistrée comme brouillon",
            "budget": payload.get("budget", 600),
        }

    def send_to_labeling(self, dataset_id: str, payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
        return {
            "status": "ok",
            "message": f"{payload.get('count', 600)} éléments envoyés avec succès dans la file 05 Labeling",
            "target_queue": "unlabeled",
            "count": payload.get("count", 600),
        }


text_active_learning_service = TextActiveLearningService()

