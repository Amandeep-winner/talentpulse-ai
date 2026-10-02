from fastapi.testclient import TestClient
from app.main import app
from app.config import ML_SERVICE_TOKEN

client = TestClient(app)

def test_health_endpoint_does_not_require_auth():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["service"] == "talentpulse-ml"

def test_models_endpoint_rejects_missing_auth():
    response = client.get("/models")
    assert response.status_code == 422 or response.status_code == 401

def test_models_endpoint_rejects_invalid_token():
    response = client.get("/models", headers={"x-service-token": "wrong-token"})
    assert response.status_code == 401
    assert "Invalid or missing service token" in response.json()["detail"]

def test_models_endpoint_accepts_valid_token():
    response = client.get("/models", headers={"x-service-token": ML_SERVICE_TOKEN})
    assert response.status_code == 200
    assert "models" in response.json()
