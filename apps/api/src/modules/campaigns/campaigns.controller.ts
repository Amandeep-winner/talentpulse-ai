import { Request, Response, NextFunction } from 'express';
import {
  campaignFilterQuerySchema,
  createCampaignRequestSchema,
  updateCampaignRequestSchema,
  setAllocationsRequestSchema,
  campaignSpendInputSchema,
  campaignSimulateRequestSchema,
} from '@talentpulse/shared';
import { campaignsService } from './campaigns.service';

export class CampaignsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedQuery = campaignFilterQuerySchema.parse(req.query);
      const result = await campaignsService.listCampaigns(
        req.user!.organizationId,
        parsedQuery,
      );
      res.status(200).json({
        data: result.campaigns,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const campaign = await campaignsService.getCampaign(
        req.user!.organizationId,
        req.params.id as string,
      );
      res.status(200).json({ data: campaign });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedBody = createCampaignRequestSchema.parse(req.body);
      const campaign = await campaignsService.createCampaign(
        req.user!.organizationId,
        parsedBody,
      );
      res.status(201).json({ data: campaign });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedBody = updateCampaignRequestSchema.parse(req.body);
      const updated = await campaignsService.updateCampaign(
        req.user!.organizationId,
        req.params.id as string,
        parsedBody,
      );
      res.status(200).json({ data: updated });
    } catch (error) {
      next(error);
    }
  }

  async getAllocations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const allocations = await campaignsService.getAllocations(
        req.user!.organizationId,
        req.params.id as string,
      );
      res.status(200).json({ data: allocations });
    } catch (error) {
      next(error);
    }
  }

  async setAllocations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { allocations } = setAllocationsRequestSchema.parse(req.body);
      const result = await campaignsService.setAllocations(
        req.user!.organizationId,
        req.params.id as string,
        allocations,
      );
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  async recordSpend(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedBody = campaignSpendInputSchema.parse(req.body);
      await campaignsService.recordSpend(
        req.user!.organizationId,
        req.params.id as string,
        parsedBody,
      );
      res.status(200).json({ message: 'Spend recorded successfully' });
    } catch (error) {
      next(error);
    }
  }

  async simulate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedBody = campaignSimulateRequestSchema.parse(req.body);
      const result = await campaignsService.simulateCampaign(
        req.user!.organizationId,
        req.params.id as string,
        parsedBody
      );
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const campaignsController = new CampaignsController();
