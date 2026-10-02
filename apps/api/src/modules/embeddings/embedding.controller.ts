import { Request, Response, NextFunction } from 'express';
import { embeddingService } from './embedding.service';

export class EmbeddingController {
  public async embedJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const orgId = req.user?.organizationId;
      const result = await embeddingService.embedJob(id!, orgId);
      res.status(200).json({
        data: {
          jobId: id,
          ...result,
          message: 'Job embedded successfully',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async embedCandidate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const orgId = req.user?.organizationId;
      const result = await embeddingService.embedCandidate(id!, orgId);
      res.status(200).json({
        data: {
          candidateId: id,
          ...result,
          message: 'Candidate embedded successfully',
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public async reindexAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.user?.organizationId;
      if (!orgId) {
        res.status(401).json({ error: { code: 'UNAUTHENTICATED', message: 'User not authenticated' } });
        return;
      }
      const result = await embeddingService.reindexAll(orgId);
      res.status(200).json({
        data: {
          ...result,
          message: 'All candidates and jobs reindexed successfully',
        },
      });
    } catch (err) {
      next(err);
    }
  }
}

export const embeddingController = new EmbeddingController();
