import { Request, Response, NextFunction } from 'express';
import { matchingService } from './matching.service';

export class MatchingController {
  async getJobMatches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const jobId = req.params.id as string;
      const orgId = req.user!.organizationId;
      const userId = req.user?.id;
      const limit = req.query.limit ? Number(req.query.limit) : 20;

      const result = await matchingService.getJobMatches(jobId, orgId, limit, userId);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const matchingController = new MatchingController();
