import { Request, Response, NextFunction } from 'express';
import { banditService } from './bandit.service';
import {
  banditDecideRequestSchema,
  banditRewardRequestSchema,
  banditSimulationRequestSchema,
  BanditAlgorithmEnum,
} from '@talentpulse/shared';

export class BanditController {
  async decide(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = banditDecideRequestSchema.parse(req.body);
      const result = await banditService.decide(
        req.user!.organizationId,
        parsed,
        req.user!.id
      );
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  async reward(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = banditRewardRequestSchema.parse(req.body);
      const result = await banditService.reward(req.user!.organizationId, parsed);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  async simulate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsed = banditSimulationRequestSchema.parse(req.body);
      const result = await banditService.simulate(
        req.user!.organizationId,
        parsed,
        req.user!.role
      );
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  async getState(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const algoParam = req.query.algorithm as string | undefined;
      const parsedAlgo = algoParam ? BanditAlgorithmEnum.parse(algoParam) : 'linucb';
      const result = await banditService.getState(req.user!.organizationId, parsedAlgo);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  async reset(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const algoParam = req.body.algorithm as string | undefined;
      const parsedAlgo = algoParam ? BanditAlgorithmEnum.parse(algoParam) : 'linucb';
      const result = await banditService.reset(
        req.user!.organizationId,
        parsedAlgo,
        req.user!.role
      );
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const banditController = new BanditController();
