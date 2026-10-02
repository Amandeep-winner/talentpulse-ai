from fastapi import Header, HTTPException, status
from app.config import ML_SERVICE_TOKEN

def verify_service_token(x_service_token: str = Header(..., alias="x-service-token")) -> str:
    """Verifies internal service token authentication."""
    if not x_service_token or x_service_token != ML_SERVICE_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing service token",
        )
    return x_service_token
