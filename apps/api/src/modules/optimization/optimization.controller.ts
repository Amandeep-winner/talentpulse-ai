import { Request, Response, NextFunction } from 'express';
import { optimizationService } from './optimization.service';
import { proposeOptimizationRequestSchema, RecommendationStatus } from '@talentpulse/shared';

export class OptimizationController {
  async propose(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = proposeOptimizationRequestSchema.parse(req.body);
      const recommendation = await optimizationService.propose(
        req.user!.organizationId,
        parsed,
        req.user!.id
      );
      res.status(200).json({ data: recommendation });
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const campaignId = req.query.campaignId as string | undefined;
      const status = req.query.status as RecommendationStatus | undefined;
      const recommendations = await optimizationService.list(
        req.user!.organizationId,
        { campaignId, status }
      );
      res.status(200).json({ data: recommendations });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const recommendation = await optimizationService.getById(
        req.user!.organizationId,
        req.params.id as string
      );
      res.status(200).json({ data: recommendation });
    } catch (error) {
      next(error);
    }
  }

  async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const recommendation = await optimizationService.approve(
        req.user!.organizationId,
        req.params.id as string,
        req.user!.id,
        req.user!.role
      );
      res.status(200).json({ data: recommendation });
    } catch (error) {
      next(error);
    }
  }

  async reject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const recommendation = await optimizationService.reject(
        req.user!.organizationId,
        req.params.id as string,
        req.user!.id,
        req.user!.role
      );
      res.status(200).json({ data: recommendation });
    } catch (error) {
      next(error);
    }
  }
}

export const optimizationController = new OptimizationController();
