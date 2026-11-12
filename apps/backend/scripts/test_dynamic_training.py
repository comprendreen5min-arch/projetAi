import sys
sys.path.insert(0, '/app')
import pyarrow.parquet as pq
import pandas as pd
import numpy as np
from app.core.database import SessionLocal
from app.models.dataset import Dataset
from app.models.dataset_version import DatasetVersion
from app.services.labeling_service import labeling_service
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import precision_recall_curve, average_precision_score, brier_score_loss, confusion_matrix

TECH_COLS = {"split", "is_synthetic", "origin", "parent_ids"}
ID_COLS = {"customer_id", "client_id", "id", "user_id"}

def test_full_pipeline():
    db = SessionLocal()
    datasets = db.query(Dataset).all()
    for d in datasets:
        version = db.query(DatasetVersion).filter(DatasetVersion.dataset_id == d.id).order_by(DatasetVersion.created_at.desc()).first()
        if not version or not version.storage_path:
            continue
        df = pq.read_table(version.storage_path).to_pandas()
        if len(df) < 5:
            continue
        print(f"\n============================\nDataset: {d.name} ({len(df)} rows)")
        target_col, pos_label, neg_label, _ = labeling_service.detect_target_and_classes(df, version)
        
        # Leaks
        leak_cols = [c for c in df.columns if any(k in c.lower() for k in ["cancel_date", "churn_date", "date_fin"])]
        
        # Features
        feature_cols = [c for c in df.columns if c not in TECH_COLS and c != target_col and c.lower() not in ID_COLS and not c.lower().endswith("_id") and c not in leak_cols]
        print(f"Features ({len(feature_cols)}): {feature_cols}")
        
        # Splits
        if "split" in df.columns:
            train_mask = (df["split"] == "train")
            val_mask = (df["split"] == "val")
            test_mask = (df["split"] == "test")
        else:
            n = len(df)
            train_mask = pd.Series([i < int(n * 0.7) for i in range(n)], index=df.index)
            val_mask = pd.Series([int(n * 0.7) <= i < int(n * 0.85) for i in range(n)], index=df.index)
            test_mask = pd.Series([i >= int(n * 0.85) for i in range(n)], index=df.index)
            
        print(f"Splits: train={train_mask.sum()}, val={val_mask.sum()}, test={test_mask.sum()}")
        
        # Preprocessing X
        X_df = df[feature_cols].copy()
        for c in feature_cols:
            if not pd.api.types.is_numeric_dtype(X_df[c]):
                X_df[c] = pd.factorize(X_df[c].astype(str))[0]
            else:
                X_df[c] = X_df[c].fillna(X_df[c].median())
                
        y_train = (df.loc[train_mask, target_col].astype(str) == str(pos_label)).astype(int)
        X_train = X_df.loc[train_mask]
        
        y_val = (df.loc[val_mask, target_col].astype(str) == str(pos_label)).astype(int)
        X_val = X_df.loc[val_mask]
        
        # Train RandomForest or HistGradientBoosting
        clf = RandomForestClassifier(n_estimators=30, random_state=42)
        clf.fit(X_train, y_train)
        
        val_probs = clf.predict_proba(X_val)[:, 1] if len(X_val) > 0 else np.array([0.5])
        val_preds = (val_probs >= 0.5).astype(int)
        
        # Feature importances
        imps = clf.feature_importances_
        sorted_feats = sorted(zip(feature_cols, imps), key=lambda x: x[1], reverse=True)
        print("Feature importances:", sorted_feats[:4])
        
        # Slices
        slices = []
        for c in feature_cols:
            vals = df[c].value_counts()
            for v, count in vals.head(2).items():
                mask_slice = (df[c].astype(str) == str(v)) & val_mask
                if mask_slice.sum() >= 2:
                    y_slice = (df.loc[mask_slice, target_col].astype(str) == str(pos_label)).astype(int)
                    probs_slice = val_probs[mask_slice[val_mask].values] if len(val_probs) == len(val_mask[val_mask]) else [0.5]
                    rec = (np.array(probs_slice) >= 0.5)[y_slice == 1].mean() if (y_slice == 1).sum() > 0 else 1.0
                    slices.append({"segment": f"{c} = {v}", "rows": int(mask_slice.sum()), "recall": round(float(rec), 2)})
        print("Slices:", slices[:3])
        
    db.close()

if __name__ == '__main__':
    test_full_pipeline()
