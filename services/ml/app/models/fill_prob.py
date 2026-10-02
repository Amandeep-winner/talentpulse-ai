from typing import List, Dict, Any, Tuple, Optional
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

from app.models.registry import registry
from app.schemas import TopFactor

MODEL_NAME = "fill_prob"

FEATURES = [
    "salary_band",
    "skills_count",
    "applications_first_7d",
    "qualified_rate",
    "spend",
    "experience_req",
]

def get_risk_bucket(probability: float) -> str:
    """Derives recruitment risk bucket from fill probability."""
    if probability < 0.35:
        return "High"
    elif probability < 0.65:
        return "Medium"
    else:
        return "Low"

def train_fill_model(
    rows: List[Dict[str, Any]],
    version: str = None,
) -> Dict[str, Any]:
    """Trains a RandomForestClassifier to predict job fill probability within 45 days."""
    if not rows or len(rows) < 20:
        raise ValueError(f"Insufficient data: at least 20 rows required for training, received {len(rows) if rows else 0}")

    df = pd.DataFrame(rows)

    required_cols = FEATURES + ["filled_within_45d"]
    for col in required_cols:
        if col not in df.columns:
            raise ValueError(f"Missing required training column: {col}")

    X = df[FEATURES]
    y = df["filled_within_45d"].astype(int).values

    pos_count = int(np.sum(y == 1))
    neg_count = int(np.sum(y == 0))
    total_count = len(y)

    if total_count < 20 or pos_count < 3 or neg_count < 3:
        raise ValueError(
            f"Insufficient data or class imbalance for training: total={total_count}, pos={pos_count}, neg={neg_count}"
        )

    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("classifier", RandomForestClassifier(n_estimators=100, max_depth=5, random_state=42, class_weight="balanced")),
    ])

    pipeline.fit(X_train, y_train)

    val_preds_prob = pipeline.predict_proba(X_val)[:, 1]
    val_preds_binary = (val_preds_prob >= 0.5).astype(int)

    try:
        auc = float(roc_auc_score(y_val, val_preds_prob))
    except Exception:
        auc = 0.5

    precision = float(precision_score(y_val, val_preds_binary, zero_division=0))
    recall = float(recall_score(y_val, val_preds_binary, zero_division=0))
    f1 = float(f1_score(y_val, val_preds_binary, zero_division=0))
    cm = confusion_matrix(y_val, val_preds_binary).tolist()

    classifier = pipeline.named_steps["classifier"]
    raw_importances = classifier.feature_importances_
    imp_sum = np.sum(raw_importances) or 1.0
    norm_importances = (raw_importances / imp_sum).tolist()

    feature_importance_dict = {
        name: round(float(imp), 4) for name, imp in zip(FEATURES, norm_importances)
    }

    numeric_stats = {
        col: {
            "mean": float(df[col].mean()),
            "std": float(df[col].std()) if df[col].std() > 0 else 1.0,
        }
        for col in FEATURES
    }

    metrics = {
        "model": "RandomForestClassifier",
        "roc_auc": round(auc, 4),
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
        "numeric_stats": numeric_stats,
    }

    metadata = registry.save_model(
        model_name=MODEL_NAME,
        pipeline=pipeline,
        metrics=metrics,
        training_rows=total_count,
        version=version,
        set_active=True,
    )

    return metadata

def predict_fill_prob(features: Dict[str, Any]) -> Tuple[float, str, str, List[TopFactor]]:
    """Predicts fill probability, calculates risk bucket, and explains top factors."""
    pipeline, metadata = registry.load_model(MODEL_NAME)
    version = metadata.get("version", "unknown")
    metrics = metadata.get("metrics", {})
    stats = metrics.get("numeric_stats", {})
    importances = metrics.get("feature_importances", {})

    input_df = pd.DataFrame([features])
    prob = float(pipeline.predict_proba(input_df)[0, 1])
    risk = get_risk_bucket(prob)

    # Compute explainability factors
    top_factors: List[TopFactor] = []

    # Explanations for key features
    descriptions = {
        "salary_band": ("Competitive salary range", "Below market salary offer"),
        "skills_count": ("Focused skill requirements", "High skill requirement hurdle"),
        "applications_first_7d": ("Strong early application volume", "Slow initial applicant response"),
        "qualified_rate": ("High candidate qualification rate", "Low candidate qualification yield"),
        "spend": ("Sufficient promotional advertising spend", "Constrained campaign ad spend"),
        "experience_req": ("Accessible experience threshold", "High minimum experience requirement"),
    }

    for feature_name in FEATURES:
        if feature_name in features and feature_name in stats:
            val = float(features[feature_name])
            mean = stats[feature_name]["mean"]
            std = stats[feature_name]["std"]
            dev = (val - mean) / (std or 1.0)
            imp = importances.get(feature_name, 0.1)

            # Features where higher is better for fill: salary_band, applications_first_7d, qualified_rate, spend
            # Features where lower is easier to fill: skills_count, experience_req
            if feature_name in ["skills_count", "experience_req"]:
                factor_weight = -dev * imp
            else:
                factor_weight = dev * imp

            impact = "positive" if factor_weight > 0 else "negative"
            pos_desc, neg_desc = descriptions.get(feature_name, (f"Favorable {feature_name}", f"Challenging {feature_name}"))
            desc = pos_desc if factor_weight > 0 else neg_desc

            top_factors.append(
                TopFactor(
                    feature=feature_name,
                    impact=impact,
                    weight=round(abs(factor_weight), 4),
                    description=desc,
                )
            )

    top_factors.sort(key=lambda f: f.weight, reverse=True)
    return round(prob, 4), risk, version, top_factors[:3]
