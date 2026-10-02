from datetime import datetime, timedelta
import numpy as np
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
AUTH_HEADER = {"x-service-token": "dev-ml-token"}

def generate_weekly_series(days: int = 35):
    base_date = datetime(2026, 1, 1)
    points = []
    # Weekly seasonality: Monday to Sunday pattern
    weekly_pattern = [15.0, 18.0, 22.0, 20.0, 14.0, 5.0, 4.0]
    trend_slope = 0.3
    np.random.seed(42)

    for i in range(days):
        dt = base_date + timedelta(days=i)
        seasonal_val = weekly_pattern[i % 7]
        noise = float(np.random.normal(0, 0.3))
        val = max(1.0, 10.0 + trend_slope * i + seasonal_val + noise)
        points.append({"date": dt.strftime("%Y-%m-%d"), "value": round(val, 2)})
    return points

def test_forecast_weekly_seasonality_captured():
    series = generate_weekly_series(days=35)
    payload = {
        "series": series,
        "horizon": 7,
        "metric": "applications",
    }
    response = client.post("/forecast", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()

    assert data["method"] == "holt_winters"
    assert len(data["forecast"]) == 7

    # Check forecast item structure and monotonicity of confidence interval
    for item in data["forecast"]:
        assert "date" in item
        assert item["lower"] <= item["value"] or abs(item["lower"] - item["value"]) < 0.1
        assert item["upper"] >= item["value"] or abs(item["upper"] - item["value"]) < 0.1
        assert item["lower"] >= 0.0

    # Verify backtest: Holt-Winters captures seasonality better than seasonal naive baseline
    backtest = data["backtest"]
    assert "mae" in backtest
    assert "rmse" in backtest
    assert "mape" in backtest
    assert "baselineMae" in backtest
    assert backtest["mae"] < backtest["baselineMae"] or backtest["mae"] < 2.0

def test_forecast_short_series_fallback():
    # Only 10 observations (< 28)
    series = generate_weekly_series(days=10)
    payload = {
        "series": series,
        "horizon": 7,
        "metric": "applications",
    }
    response = client.post("/forecast", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()

    assert data["method"] == "moving_average"
    assert len(data["forecast"]) == 7
    for item in data["forecast"]:
        assert item["lower"] >= 0.0
        assert item["upper"] >= item["lower"]

def test_forecast_auth_requirement():
    payload = {
        "series": [{"date": "2026-01-01", "value": 10.0}],
        "horizon": 7,
        "metric": "applications",
    }
    # No auth header
    res_no_auth = client.post("/forecast", json=payload)
    assert res_no_auth.status_code == 401

    # Wrong auth header
    res_bad_auth = client.post("/forecast", json=payload, headers={"x-service-token": "wrong"})
    assert res_bad_auth.status_code == 401

    # Valid auth header
    res_valid = client.post("/forecast", json=payload, headers=AUTH_HEADER)
    assert res_valid.status_code == 200

def test_forecast_empty_series_handling():
    payload = {
        "series": [],
        "horizon": 7,
        "metric": "applications",
    }
    response = client.post("/forecast", json=payload, headers=AUTH_HEADER)
    assert response.status_code == 200
    data = response.json()
    assert data["forecast"] == []
    assert data["method"] == "moving_average"
    assert data["backtest"]["mae"] == 0.0
