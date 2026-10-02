from typing import List, Dict, Any, Tuple
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from app.models.registry import registry
from app.schemas import TopFactor

MODEL_NAME = "application_prob"

CATEGORICAL_FEATURES = ["job_category", "location_tier", "publisher_type"]
NUMERIC_FEATURES = [
    "experience_req",
    "historical_ctr",
    "historical_cpa",
    "historical_conv",
    "day_of_week",
    "bid",
    "budget",
]
ALL_FEATURES = CATEGORICAL_FEATURES + NUMERIC_FEATURES

def create_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore", sparse_output=False),
                CATEGORICAL_FEATURES,
            ),
            (
                "num",
                StandardScaler(),
                NUMERIC_FEATURES,
            ),
        ]
    )

def train_application_model(
    rows: List[Dict[str, Any]],
    version: str = None,
) -> Dict[str, Any]:
    """Trains LogisticRegression vs GradientBoostingClassifier and saves the winner."""
    if not rows or len(rows) < 20:
        raise ValueError(f"Insufficient data: at least 20 rows required for training, received {len(rows) if rows else 0}")

    df = pd.DataFrame(rows)

    required_cols = ALL_FEATURES + ["converted"]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Missing required training column: {col}")

    X = df[ALL_FEATURES]
    y = df["converted"].astype(int).values

    # Check class balance
    pos_count = int(np.sum(y == 1))
    neg_count = int(np.sum(y == 0))
    total_count = len(y)

    if total_count < 20 or pos_count < 3 or neg_count < 3:
        raise ValueError(
            f"Insufficient data or class imbalance for training: total={total_count}, pos={pos_count}, neg={neg_count}"
        )

    # Stratified split
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # 1. Baseline: Logistic Regression
    lr_pipeline = Pipeline([
        ("preprocessor", create_preprocessor()),
        ("classifier", LogisticRegression(max_iter=1000, random_state=42, class_weight="balanced")),
    ])
    lr_pipeline.fit(X_train, y_train)
    lr_val_preds = lr_pipeline.predict_proba(X_val)[:, 1]
    try:
        lr_auc = float(roc_auc_score(y_val, lr_val_preds))
    except Exception:
        lr_auc = 0.5

    # 2. Gradient Boosting Classifier
    gb_pipeline = Pipeline([
        ("preprocessor", create_preprocessor()),
        ("classifier", GradientBoostingClassifier(n_estimators=100, learning_rate=0.1, max_depth=3, random_state=42)),
    ])
    gb_pipeline.fit(X_train, y_train)
    gb_val_preds = gb_pipeline.predict_proba(X_val)[:, 1]
    try:
        gb_auc = float(roc_auc_score(y_val, gb_val_preds))
    except Exception:
        gb_auc = 0.5

    # Select best model by validation ROC-AUC
    if gb_auc >= lr_auc:
        best_pipeline = gb_pipeline
        best_name = "GradientBoostingClassifier"
        best_auc = gb_auc
        val_preds_prob = gb_val_preds
    else:
        best_pipeline = lr_pipeline
        best_name = "LogisticRegression"
        best_auc = lr_auc
        val_preds_prob = lr_val_preds

    val_preds_binary = (val_preds_prob >= 0.5).astype(int)

    precision = float(precision_score(y_val, val_preds_binary, zero_division=0))
    recall = float(recall_score(y_val, val_preds_binary, zero_division=0))
    f1 = float(f1_score(y_val, val_preds_binary, zero_division=0))
    cm = confusion_matrix(y_val, val_preds_binary).tolist()

    # Extract feature importances
    preprocessor = best_pipeline.named_steps["preprocessor"]
    cat_feature_names = preprocessor.named_transformers_["cat"].get_feature_names_out(CATEGORICAL_FEATURES).tolist()
    feature_names = cat_feature_names + NUMERIC_FEATURES

    classifier = best_pipeline.named_steps["classifier"]
    if hasattr(classifier, "feature_importances_"):
        raw_importances = classifier.feature_importances_
    elif hasattr(classifier, "coef_"):
        raw_importances = np.abs(classifier.coef_[0])
    else:
        raw_importances = np.ones(len(feature_names))

    # Normalize feature importances
    imp_sum = np.sum(raw_importances) or 1.0
    norm_importances = (raw_importances / imp_sum).tolist()
    feature_importance_dict = {
        name: round(float(imp), 4) for name, imp in zip(feature_names, norm_importances)
    }

    # Store baseline feature statistics for explainability
    numeric_stats = {
        col: {
            "mean": float(df[col].mean()),
            "std": float(df[col].std()) if df[col].std() > 0 else 1.0,
        }
        for col in NUMERIC_FEATURES
    }

    metrics = {
        "best_model": best_name,
        "roc_auc": round(best_auc, 4),
        "precision": round(precision, 4),
        "recall": round(recall, 4),
        "f1": round(f1, 4),
        "confusion_matrix": cm,
        "class_balance": {
            "positive": pos_count,
            "negative": neg_count,
            "positive_ratio": round(pos_count / total_count, 4),
        },
        "feature_importances": feature_importance_dict,
        "validation_split": 0.2,
        "candidate_models": {
            "LogisticRegression": {"val_roc_auc": round(lr_auc, 4)},
            "GradientBoostingClassifier": {"val_roc_auc": round(gb_auc, 4)},
        },
        "numeric_stats": numeric_stats,
    }

    # Save to model registry
    metadata = registry.save_model(
        model_name=MODEL_NAME,
        pipeline=best_pipeline,
        metrics=metrics,
        training_rows=total_count,
        version=version,
        set_active=True,
    )

    return metadata

def predict_application_prob(features: Dict[str, Any]) -> Tuple[float, str, List[TopFactor]]:
    """Predicts application probability and generates explainability factors."""
    pipeline, metadata = registry.load_model(MODEL_NAME)
    version = metadata.get("version", "unknown")
    metrics = metadata.get("metrics", {})
    stats = metrics.get("numeric_stats", {})
    importances = metrics.get("feature_importances", {})

    input_df = pd.DataFrame([features])
    prob = float(pipeline.predict_proba(input_df)[0, 1])

    # Compute top explainability factors
    top_factors: List[TopFactor] = []

    # Check numeric deviations
    for num_col in NUMERIC_FEATURES:
        if num_col in features and num_col in stats:
            val = float(features[num_col])
            mean = stats[num_col]["mean"]
            std = stats[num_col]["std"]
            dev = (val - mean) / (std or 1.0)
            imp = importances.get(num_col, 0.05)
            factor_weight = dev * imp

            if abs(factor_weight) > 0.01:
                impact = "positive" if factor_weight > 0 else "negative"
                desc = (
                    f"Higher {num_col.replace('_', ' ')} ({val:.2f} vs avg {mean:.2f})"
                    if dev > 0
                    else f"Lower {num_col.replace('_', ' ')} ({val:.2f} vs avg {mean:.2f})"
                )
                top_factors.append(
                    TopFactor(
                        feature=num_col,
                        impact=impact,
                        weight=round(abs(factor_weight), 4),
                        description=desc,
                    )
                )

    # Sort factors by impact magnitude and keep top 3
    top_factors.sort(key=lambda f: f.weight, reverse=True)
    return round(prob, 4), version, top_factors[:3]
