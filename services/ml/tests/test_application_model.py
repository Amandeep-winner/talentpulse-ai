import pytest
from app.models.application_prob import train_application_model, predict_application_prob
from app.seed import generate_synthetic_application_rows

def test_application_model_training_and_metrics():
    rows = generate_synthetic_application_rows(n=150, seed=123)
    metadata = train_application_model(rows, version="test-app-v1")

    assert metadata["name"] == "application_prob"
    assert metadata["version"] == "test-app-v1"
    assert metadata["trainingRows"] == 150

    metrics = metadata["metrics"]
    # Task 21 gate: AUC > 0.60
    assert metrics["roc_auc"] > 0.60
    assert 0.0 <= metrics["precision"] <= 1.0
    assert 0.0 <= metrics["recall"] <= 1.0
    assert 0.0 <= metrics["f1"] <= 1.0
    assert len(metrics["confusion_matrix"]) == 2
    assert "positive" in metrics["class_balance"]
    assert len(metrics["feature_importances"]) > 5

def test_application_model_prediction_and_top_factors():
    sample_features = {
        "job_category": "engineering",
        "experience_req": 5.0,
        "location_tier": "tier_1",
        "publisher_type": "job_board",
        "historical_ctr": 0.045,
        "historical_cpa": 120.0,
        "historical_conv": 0.22,
        "day_of_week": 2,
        "bid": 2.5,
        "budget": 1500.0,
    }

    prob, version, top_factors = predict_application_prob(sample_features)
    assert 0.0 <= prob <= 1.0
    assert version == "test-app-v1"
    assert isinstance(top_factors, list)
    if top_factors:
        factor = top_factors[0]
        assert factor.feature in sample_features
        assert factor.impact in ["positive", "negative"]
        assert factor.weight >= 0
        assert len(factor.description) > 0

def test_application_model_rejects_insufficient_data():
    with pytest.raises(ValueError, match="Insufficient data"):
        train_application_model([{"converted": 1}] * 5)
