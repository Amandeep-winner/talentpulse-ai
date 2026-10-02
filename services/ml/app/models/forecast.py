import logging
from datetime import datetime, timedelta
from typing import List
import numpy as np

from app.schemas import (
    ForecastRequest,
    ForecastResponse,
    ForecastItem,
    BacktestMetrics,
)

logger = logging.getLogger("talentpulse.forecast")

def forecast_series(request: ForecastRequest) -> ForecastResponse:
    """
    Generate time-series forecast using Holt-Winters Exponential Smoothing
    with additive trend and weekly seasonality when >= 28 points are available.
    Falls back to moving average if < 28 points or if Holt-Winters fails to converge.
    Computes rolling-origin holdout backtest (last 14 days) vs seasonal-naive baseline.
    """
    if not request.series:
        return ForecastResponse(
            forecast=[],
            method="moving_average",
            backtest=BacktestMetrics(mae=0.0, rmse=0.0, mape=0.0, baselineMae=0.0),
        )

    # Sort chronological
    sorted_points = sorted(request.series, key=lambda p: p.date)
    y = np.array([float(p.value) for p in sorted_points], dtype=float)

    # Parse last observation date
    try:
        last_date = datetime.strptime(sorted_points[-1].date[:10], "%Y-%m-%d")
    except Exception:
        last_date = datetime.utcnow()

    # Attempt Holt-Winters if at least 28 observations
    if len(y) >= 28:
        try:
            from statsmodels.tsa.holtwinters import ExponentialSmoothing

            # 1. Backtest evaluation on rolling-origin 14-day holdout
            train_y = y[:-14]
            holdout_y = y[-14:]

            hw_backtest = ExponentialSmoothing(
                train_y,
                trend="add",
                seasonal="add",
                seasonal_periods=7,
                initialization_method="estimated",
            ).fit(optimized=True)

            holdout_preds = hw_backtest.forecast(14)
            # Clip negative predictions to 0
            holdout_preds = np.maximum(0.0, holdout_preds)

            mae = float(np.mean(np.abs(holdout_y - holdout_preds)))
            rmse = float(np.sqrt(np.mean((holdout_y - holdout_preds) ** 2)))
            mape = float(np.mean(np.abs(holdout_y - holdout_preds) / np.maximum(np.abs(holdout_y), 1.0)))

            # Seasonal-naive baseline: value 7 days prior
            # For day k in holdout (0..13), seasonal lag is y[-21 + k]
            seasonal_naive_pred = y[-21:-7]
            baseline_mae = float(np.mean(np.abs(holdout_y - seasonal_naive_pred)))

            # 2. Fit Holt-Winters on the entire series for forward forecasting
            hw_full = ExponentialSmoothing(
                y,
                trend="add",
                seasonal="add",
                seasonal_periods=7,
                initialization_method="estimated",
            ).fit(optimized=True)

            preds = hw_full.forecast(request.horizon)
            residuals = y - hw_full.fittedvalues
            std_err = float(np.std(residuals))
            if std_err <= 1e-4:
                std_err = max(1.0, float(np.mean(y)) * 0.1)

            forecast_items: List[ForecastItem] = []
            for i in range(request.horizon):
                step_date = last_date + timedelta(days=i + 1)
                date_str = step_date.strftime("%Y-%m-%d")
                val = max(0.0, float(preds[i]))
                width = 1.96 * std_err * np.sqrt(1.0 + 0.05 * (i + 1))
                lower = max(0.0, float(val - width))
                upper = max(lower, float(val + width))

                forecast_items.append(
                    ForecastItem(
                        date=date_str,
                        value=round(val, 2),
                        lower=round(lower, 2),
                        upper=round(upper, 2),
                    )
                )

            return ForecastResponse(
                forecast=forecast_items,
                method="holt_winters",
                backtest=BacktestMetrics(
                    mae=round(mae, 3),
                    rmse=round(rmse, 3),
                    mape=round(mape, 4),
                    baselineMae=round(baseline_mae, 3),
                ),
            )
        except Exception as e:
            logger.warning("Holt-Winters failed, falling back to moving average: %s", str(e))

    # Moving Average Fallback
    window_size = min(7, len(y))
    recent_vals = y[-window_size:] if len(y) > 0 else np.array([0.0])
    mean_val = float(np.mean(recent_vals))
    std_val = float(np.std(recent_vals)) if len(recent_vals) > 1 else max(1.0, mean_val * 0.15)
    if std_val < 1e-4:
        std_val = max(1.0, mean_val * 0.15)

    forecast_items: List[ForecastItem] = []
    for i in range(request.horizon):
        step_date = last_date + timedelta(days=i + 1)
        date_str = step_date.strftime("%Y-%m-%d")
        width = 1.96 * std_val * np.sqrt(1.0 + 0.03 * (i + 1))
        lower = max(0.0, float(mean_val - width))
        upper = max(lower, float(mean_val + width))

        forecast_items.append(
            ForecastItem(
                date=date_str,
                value=round(max(0.0, mean_val), 2),
                lower=round(lower, 2),
                upper=round(upper, 2),
            )
        )

    # Backtest for moving average
    if len(y) >= 4:
        holdout_len = min(7, max(1, len(y) // 3))
        train_y = y[:-holdout_len]
        holdout_y = y[-holdout_len:]
        train_window = min(7, len(train_y))
        pred_val = float(np.mean(train_y[-train_window:]))
        holdout_preds = np.full_like(holdout_y, pred_val)

        mae = float(np.mean(np.abs(holdout_y - holdout_preds)))
        rmse = float(np.sqrt(np.mean((holdout_y - holdout_preds) ** 2)))
        mape = float(np.mean(np.abs(holdout_y - holdout_preds) / np.maximum(np.abs(holdout_y), 1.0)))

        # Naive baseline (last value from training set)
        baseline_pred = np.full_like(holdout_y, train_y[-1])
        baseline_mae = float(np.mean(np.abs(holdout_y - baseline_pred)))
    else:
        mae = 0.0
        rmse = 0.0
        mape = 0.0
        baseline_mae = 0.0

    return ForecastResponse(
        forecast=forecast_items,
        method="moving_average",
        backtest=BacktestMetrics(
            mae=round(mae, 3),
            rmse=round(rmse, 3),
            mape=round(mape, 4),
            baselineMae=round(baseline_mae, 3),
        ),
    )
