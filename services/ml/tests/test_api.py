from fastapi.testclient import TestClient
from app.main import app
from app.config import ML_SERVICE_TOKEN
from app.seed import generate_synthetic_application_rows, generate_synthetic_fill_rows

client = TestClient(app)
AUTH_HEADERS = {"x-service-token": ML_SERVICE_TOKEN}

def test_full_api_workflow():
    # 1. Health check
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["status"] == "ok"

    # 2. List models
    res = client.get("/models", headers=AUTH_HEADERS)
    assert res.status_code == 200
    assert "models" in res.json()

    # 3. Train application_prob
    app_rows = generate_synthetic_application_rows(n=100, seed=789)
    train_res = client.post(
        "/train/application_prob",
        json={"rows": app_rows},
        headers=AUTH_HEADERS,
    )
    assert train_res.status_code == 200
    train_data = train_res.json()
    assert train_data["model"] == "application_prob"
    assert train_data["metrics"]["roc_auc"] > 0.60

    # 4. Predict application_prob
    pred_res = client.post(
        "/predict/application_prob",
        json={
            "job_category": "engineering",
            "experience_req": 4.0,
            "location_tier": "remote",
            "publisher_type": "job_board",
            "historical_ctr": 0.05,
            "historical_cpa": 110.0,
            "historical_conv": 0.25,
            "day_of_week": 1,
            "bid": 3.0,
            "budget": 2000.0,
        },
        headers=AUTH_HEADERS,
    )
    assert pred_res.status_code == 200
    pred_data = pred_res.json()
    assert 0.0 <= pred_data["probability"] <= 1.0
    assert "modelVersion" in pred_data
    assert "topFactors" in pred_data

    # 5. Train fill_prob
    fill_rows = generate_synthetic_fill_rows(n=100, seed=789)
    train_fill_res = client.post(
        "/train/fill_prob",
        json={"rows": fill_rows},
        headers=AUTH_HEADERS,
    )
    assert train_fill_res.status_code == 200
    train_fill_data = train_fill_res.json()
    assert train_fill_data["model"] == "fill_prob"
    assert train_fill_data["metrics"]["roc_auc"] > 0.60

    # 6. Predict fill_prob
    pred_fill_res = client.post(
        "/predict/fill_prob",
        json={
            "salary_band": 140.0,
            "skills_count": 6,
            "applications_first_7d": 18.0,
            "qualified_rate": 0.35,
            "spend": 850.0,
            "experience_req": 3.0,
        },
        headers=AUTH_HEADERS,
    )
    assert pred_fill_res.status_code == 200
    pred_fill_data = pred_fill_res.json()
    assert 0.0 <= pred_fill_data["probability"] <= 1.0
    assert pred_fill_data["risk"] in ["High", "Medium", "Low"]
    assert "modelVersion" in pred_fill_data
    assert "topFactors" in pred_fill_data

    # 7. Invalid model error handling
    invalid_train = client.post(
        "/train/unsupported_model",
        json={"rows": [{"test": 1}]},
        headers=AUTH_HEADERS,
    )
    assert invalid_train.status_code == 400

    invalid_pred = client.post(
        "/predict/unsupported_model",
        json={"test": 1},
        headers=AUTH_HEADERS,
    )
    assert invalid_pred.status_code == 400

    # 8. Forecast endpoint integration
    forecast_res = client.post(
        "/forecast",
        json={
            "series": [{"date": f"2026-01-{i+1:02d}", "value": 10.0 + i} for i in range(14)],
            "horizon": 7,
            "metric": "applications",
        },
        headers=AUTH_HEADERS,
    )
    assert forecast_res.status_code == 200
    forecast_data = forecast_res.json()
    assert forecast_data["method"] == "moving_average"
    assert len(forecast_data["forecast"]) == 7
    assert "backtest" in forecast_data
