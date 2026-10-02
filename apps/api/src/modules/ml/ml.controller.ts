import { Request, Response, NextFunction } from 'express';
import { mlService } from './ml.service';
import {
  trainModelRequestSchema,
  predictApplicationRequestSchema,
  predictFillRequestSchema,
} from '@talentpulse/shared';
import { ValidationError, UnauthenticatedError } from '../../lib/errors/AppError';

export class MlController {
  public async train(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = trainModelRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid training request',
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
        );
      }

      const orgId = req.user?.organizationId;
      if (!orgId) {
        throw new UnauthenticatedError('Unauthorized');
      }

      const result = await mlService.trainModel(orgId, parsed.data.model);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public async predictApplication(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = predictApplicationRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid application prediction request',
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
        );
      }

      const orgId = req.user?.organizationId;
      if (!orgId) {
        throw new UnauthenticatedError('Unauthorized');
      }

      const result = await mlService.predictApplication(orgId, parsed.data);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public async predictFill(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = predictFillRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(
          'Invalid fill prediction request',
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
        );
      }

      const orgId = req.user?.organizationId;
      if (!orgId) {
        throw new UnauthenticatedError('Unauthorized');
      }

      const result = await mlService.predictFill(orgId, parsed.data.jobId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public async listModels(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.organizationId;
      if (!orgId) {
        throw new UnauthenticatedError('Unauthorized');
      }

      const result = await mlService.listModels(orgId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const mlController = new MlController();
