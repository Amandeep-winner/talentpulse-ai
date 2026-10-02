from fastapi import APIRouter
from app.schemas import HealthResponse

router = APIRouter(tags=["Health"])

@router.get("/health", response_model=HealthResponse)
def health_check():
    """Healthcheck endpoint for orchestrators and load balancers."""
    return HealthResponse(
        status="ok",
        service="talentpulse-ml",
        version="1.0.0",
    )
