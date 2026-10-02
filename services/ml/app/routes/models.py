from fastapi import APIRouter, Depends
from app.auth import verify_service_token
from app.models.registry import registry
from app.schemas import ModelsListResponse, ModelMetadata

router = APIRouter(prefix="/models", tags=["Models"])

@router.get("", response_model=ModelsListResponse)
def list_models(_: str = Depends(verify_service_token)):
    """Lists registered ML models and active versions with evaluation metrics."""
    raw_models = registry.list_all_models()
    models = [
        ModelMetadata(
            name=m["name"],
            version=m["version"],
            trainedAt=m["trainedAt"],
            trainingRows=m["trainingRows"],
            metrics=m["metrics"],
            isActive=m.get("isActive", True),
        )
        for m in raw_models
    ]
    return ModelsListResponse(models=models)
