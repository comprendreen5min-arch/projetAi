import json
import sys
sys.path.insert(0, '/app')

from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.services.training_service import training_service

def run_checks():
    db = SessionLocal()
    try:
        datasets = db.query(Dataset).all()
        print(f"Total datasets in database: {len(datasets)}")
        
        target_names = ['data', 'marketing', 'test_churn_1000']
        for name in target_names:
            ds = next((d for d in datasets if d.name == name), None)
            if not ds:
                print(f"Dataset {name} not found!")
                continue
            
            header = training_service.get_training_header(ds.id, db)
            config = training_service.get_pre_run_checks_and_config(ds.id, db)
            runs = training_service.list_runs(ds.id, None, db)
            compare = training_service.compare_production_and_candidate(ds.id, db)
            
            cand_run = next((r for r in runs if r.tag == 'candidate'), runs[0] if runs else None)
            detail = training_service.get_run_detail(cand_run.id, split='val', db=db) if cand_run else None
            
            print(f"\n=======================================================")
            print(f"DATASET: {name} (ID: {ds.id})")
            print(f"=======================================================")
            print(f"1. HEADER:")
            print(f"   - Title/Label: {header.data_version_label}")
            print(f"   - Labels fixed since v3: {header.labels_fixed_since_v3}")
            print(f"   - Production Model: {header.production_run_name}")
            print(f"   - Candidate Model Number: {header.candidate_run_number} ({header.candidate_run_name})")
            print(f"   - Runs count: {header.total_runs} (running: {header.running_count}, failed: {header.failed_count})")
            
            print(f"\n2. SECTION 1 (CONFIG & CHECKS):")
            print(f"   - Target column: {config.target_column} (positive: {config.positive_class})")
            print(f"   - Splits summary: {config.splits_summary}")
            print(f"   - Left out count: {config.left_out_count}")
            print(f"   - Test hash: {config.checks.test_hash} ({config.checks.test_rows} rows)")
            print(f"   - SMOTE rows: {config.checks.smote_rows_in_train}")
            print(f"   - Leaks found: {config.checks.leak_columns_found}")
            print(f"   - CLI: {config.cli_command}")
            
            print(f"\n3. SECTION 2 (RUNS TABLE):")
            for r in runs[:4]:
                print(f"   - Run: {r.run_name} | Model: {r.model_type} | Status: {r.status} | Tag: {r.tag} | Recall: {r.recall_val}")
                
            print(f"\n4. SECTION 3 (CANDIDATE DETAIL - {cand_run.run_name if cand_run else 'none'}):")
            if detail:
                print(f"   - Metrics: Recall={detail.recall_yes:.2f}, Prec={detail.precision_yes:.2f}, PR-AUC={detail.pr_auc:.2f}, CalibError={detail.calibration_error:.2f}")
                print(f"   - Feature drivers: {[d.feature for d in detail.feature_drivers]}")
                print(f"   - Slices: {[s.segment for s in detail.slices]}")
                print(f"   - Error rows count: {len(detail.errors)}")
                if detail.confusion_matrix:
                    print(f"   - Confusion Matrix: TP={detail.confusion_matrix.actual_yes_pred_yes}, FN={detail.confusion_matrix.actual_yes_pred_no}, FP={detail.confusion_matrix.actual_no_pred_yes}, TN={detail.confusion_matrix.actual_no_pred_no}")
            
            print(f"\n5. SECTION 4 (COMPARE):")
            if compare:
                print(f"   - Candidate: {compare.cand_run_name}")
                print(f"   - Production: {compare.prod_run_name}")
                print(f"   - Test hash & rows: {compare.test_set_hash} ({compare.test_set_rows} rows)")
                print(f"   - Rows in comparison: {len(compare.comparison_table)}")
                print(f"   - Replay CLI: {compare.replay_command}")
    finally:
        db.close()

if __name__ == '__main__':
    run_checks()
