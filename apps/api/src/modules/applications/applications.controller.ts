import { Request, Response, NextFunction } from 'express';
import {
  applicationFilterQuerySchema,
  createApplicationRequestSchema,
  updateApplicationStatusSchema,
} from '@talentpulse/shared';
import { applicationsService } from './applications.service';

export class ApplicationsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedQuery = applicationFilterQuerySchema.parse(req.query);
      const result = await applicationsService.listApplications(
        req.user!.organizationId,
        parsedQuery,
      );
      res.status(200).json({
        data: result.applications,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const application = await applicationsService.getApplication(
        req.user!.organizationId,
        req.params.id as string,
      );
      res.status(200).json({ data: application });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedBody = createApplicationRequestSchema.parse(req.body);
      const application = await applicationsService.createApplication(
        req.user!.organizationId,
        parsedBody,
      );
      res.status(201).json({ data: application });
    } catch (error) {
      next(error);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { status } = updateApplicationStatusSchema.parse(req.body);
      const updated = await applicationsService.updateStatus(
        req.user!.organizationId,
        req.params.id as string,
        status,
      );
      res.status(200).json({ data: updated });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await applicationsService.deleteApplication(
        req.user!.organizationId,
        req.params.id as string,
      );
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }
}

export const applicationsController = new ApplicationsController();
