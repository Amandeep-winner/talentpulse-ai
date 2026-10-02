import pytest
from app.models.fill_prob import train_fill_model, predict_fill_prob, get_risk_bucket
from app.seed import generate_synthetic_fill_rows

def test_risk_bucket_thresholds():
    assert get_risk_bucket(0.20) == "High"
    assert get_risk_bucket(0.34) == "High"
    assert get_risk_bucket(0.35) == "Medium"
    assert get_risk_bucket(0.50) == "Medium"
    assert get_risk_bucket(0.64) == "Medium"
    assert get_risk_bucket(0.65) == "Low"
    assert get_risk_bucket(0.95) == "Low"

def test_fill_model_training_and_metrics():
    rows = generate_synthetic_fill_rows(n=120, seed=456)
    metadata = train_fill_model(rows, version="test-fill-v1")

    assert metadata["name"] == "fill_prob"
    assert metadata["version"] == "test-fill-v1"
    assert metadata["trainingRows"] == 120

    metrics = metadata["metrics"]
    # Task 21 gate: AUC > 0.60
    assert metrics["roc_auc"] > 0.60
    assert 0.0 <= metrics["precision"] <= 1.0
    assert 0.0 <= metrics["recall"] <= 1.0
    assert 0.0 <= metrics["f1"] <= 1.0
    assert len(metrics["confusion_matrix"]) == 2
    assert "positive" in metrics["class_balance"]
    assert len(metrics["feature_importances"]) == 6

def test_fill_model_prediction_and_top_factors():
    sample_features = {
        "salary_band": 150.0,
        "skills_count": 5,
        "applications_first_7d": 25.0,
        "qualified_rate": 0.45,
        "spend": 1200.0,
        "experience_req": 4.0,
    }

    prob, risk, version, top_factors = predict_fill_prob(sample_features)
    assert 0.0 <= prob <= 1.0
    assert risk in ["High", "Medium", "Low"]
    assert version == "test-fill-v1"
    assert len(top_factors) <= 3
    for factor in top_factors:
        assert factor.feature in sample_features
        assert factor.impact in ["positive", "negative"]
        assert factor.weight >= 0
        assert len(factor.description) > 0

def test_fill_model_rejects_insufficient_data():
    with pytest.raises(ValueError, match="Insufficient data"):
        train_fill_model([{"filled_within_45d": 1}] * 5)
