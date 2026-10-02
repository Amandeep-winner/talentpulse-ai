from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from app.auth import verify_service_token
from app.models.application_prob import predict_application_prob
from app.models.fill_prob import predict_fill_prob
from app.schemas import PredictResponse

router = APIRouter(prefix="/predict", tags=["Inference"])

SUPPORTED_MODELS = ["application_prob", "fill_prob"]

@router.post("/{model_name}", response_model=PredictResponse)
def predict(
    model_name: str,
    features: Dict[str, Any],
    _: str = Depends(verify_service_token),
):
    """Generates predictions and explainability factors for a specific model."""
    if model_name not in SUPPORTED_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported model '{model_name}'. Supported models: {SUPPORTED_MODELS}",
        )

    try:
        if model_name == "application_prob":
            prob, version, top_factors = predict_application_prob(features)
            return PredictResponse(
                probability=prob,
                risk=None,
                modelVersion=version,
                topFactors=top_factors,
            )
        elif model_name == "fill_prob":
            prob, risk, version, top_factors = predict_fill_prob(features)
            return PredictResponse(
                probability=prob,
                risk=risk,
                modelVersion=version,
                topFactors=top_factors,
            )
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference error: {str(e)}",
        )
