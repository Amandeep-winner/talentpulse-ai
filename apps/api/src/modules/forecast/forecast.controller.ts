import { Request, Response, NextFunction } from 'express';
import { forecastService } from './forecast.service';
import { getForecastQuerySchema } from '@talentpulse/shared';
import { ValidationError, UnauthenticatedError } from '../../lib/errors/AppError';

export class ForecastController {
  public async getForecast(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = getForecastQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid forecast query parameters',
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
        );
      }

      const orgId = req.user?.organizationId;
      if (!orgId) {
        throw new UnauthenticatedError('Unauthorized');
      }

      const result = await forecastService.getForecast(orgId, {
        metric: parsed.data.metric,
        horizon: parsed.data.horizon,
        campaignId: parsed.data.campaignId,
        userId: req.user?.id,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const forecastController = new ForecastController();
