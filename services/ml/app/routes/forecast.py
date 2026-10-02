from fastapi import APIRouter, Depends, HTTPException, status
from app.auth import verify_service_token
from app.models.forecast import forecast_series
from app.schemas import ForecastRequest, ForecastResponse

router = APIRouter(prefix="/forecast", tags=["Forecasting"])

@router.post("", response_model=ForecastResponse)
def get_forecast(
    request: ForecastRequest,
    _: str = Depends(verify_service_token),
):
    """
    Computes time-series forecast using Holt-Winters with additive trend and weekly seasonality
    when >= 28 points are provided, else falls back to moving average.
    Returns 95% confidence intervals and 14-day holdout backtest metrics.
    """
    try:
        return forecast_series(request)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Forecasting error: {str(e)}",
        )
