from fastapi import APIRouter, Depends, HTTPException, status
from app.auth import verify_service_token
from app.models.application_prob import train_application_model
from app.models.fill_prob import train_fill_model
from app.schemas import TrainRequest, TrainResponse

router = APIRouter(prefix="/train", tags=["Training"])

SUPPORTED_MODELS = ["application_prob", "fill_prob"]

@router.post("/{model_name}", response_model=TrainResponse)
def train_model(
    model_name: str,
    payload: TrainRequest,
    _: str = Depends(verify_service_token),
):
    """Trains and registers a new ML model version using exported database rows."""
    if model_name not in SUPPORTED_MODELS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported model '{model_name}'. Supported models: {SUPPORTED_MODELS}",
        )

    if not payload.rows or len(payload.rows) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"At least 10 rows required for training, received {len(payload.rows) if payload.rows else 0}",
        )

    try:
        if model_name == "application_prob":
            metadata = train_application_model(payload.rows)
        elif model_name == "fill_prob":
            metadata = train_fill_model(payload.rows)
        else:
            raise HTTPException(status_code=400, detail="Unknown model")

        return TrainResponse(
            model=metadata["name"],
            version=metadata["version"],
            metrics=metadata["metrics"],
            trainingRows=metadata["trainingRows"],
            trainedAt=metadata["trainedAt"],
            isActive=metadata.get("isActive", True),
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(e),
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Training failed: {str(e)}",
        )
