import { Request, Response, NextFunction } from 'express';
import { jobFilterQuerySchema } from '@talentpulse/shared';
import { jobsService } from './jobs.service';

export class JobsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedQuery = jobFilterQuerySchema.parse(req.query);
      const result = await jobsService.listJobs(req.user!.organizationId, parsedQuery);
      res.set('X-Cache', result.cached ? 'HIT' : 'MISS');
      res.status(200).json({
        data: result.data.jobs,
        meta: result.data.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const job = await jobsService.getJob(req.user!.organizationId, req.params.id as string);
      res.status(200).json({ data: job });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const job = await jobsService.createJob(req.user!.organizationId, req.body);
      res.status(201).json({ data: job });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const job = await jobsService.updateJob(
        req.user!.organizationId,
        req.params.id as string,
        req.body,
      );
      res.status(200).json({ data: job });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await jobsService.deleteJob(req.user!.organizationId, req.params.id as string);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const jobsController = new JobsController();
