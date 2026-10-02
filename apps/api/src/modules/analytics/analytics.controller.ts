import { Request, Response, NextFunction } from 'express';
import { analyticsService } from './analytics.service';

export class AnalyticsController {
  async getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const overview = await analyticsService.getOverview(req.user!.organizationId, {
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        campaignId: req.query.campaignId as string | undefined,
      });
      res.status(200).json({ data: overview });
    } catch (error) {
      next(error);
    }
  }

  async getFunnel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const funnel = await analyticsService.getFunnel(req.user!.organizationId, {
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        campaignId: req.query.campaignId as string | undefined,
      });
      res.status(200).json({ data: funnel });
    } catch (error) {
      next(error);
    }
  }

  async getTimeSeries(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const timeSeries = await analyticsService.getTimeSeries(req.user!.organizationId, {
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        campaignId: req.query.campaignId as string | undefined,
        publisherId: req.query.publisherId as string | undefined,
        interval: req.query.interval as 'day' | 'week' | undefined,
      });
      res.status(200).json({ data: timeSeries });
    } catch (error) {
      next(error);
    }
  }

  async getPublishers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const publishers = await analyticsService.getPublishers(req.user!.organizationId, {
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
        campaignId: req.query.campaignId as string | undefined,
      });
      res.status(200).json({ data: publishers });
    } catch (error) {
      next(error);
    }
  }

  async getCampaigns(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const campaigns = await analyticsService.getCampaigns(req.user!.organizationId, {
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      });
      res.status(200).json({ data: campaigns });
    } catch (error) {
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();
