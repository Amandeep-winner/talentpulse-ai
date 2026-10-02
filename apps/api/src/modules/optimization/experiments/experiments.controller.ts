import { Request, Response, NextFunction } from 'express';
import {
  createExperimentRequestSchema,
  updateExperimentStatusSchema,
  assignExperimentRequestSchema,
  convertExperimentRequestSchema,
} from '@talentpulse/shared';
import { experimentsService } from './experiments.service';
import { UnauthenticatedError } from '../../../lib/errors/AppError';

export class ExperimentsController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        throw new UnauthenticatedError('Organization context required');
      }

      const validated = createExperimentRequestSchema.parse(req.body);
      const experiment = await experimentsService.createExperiment(organizationId, validated);

      res.status(201).json({
        data: experiment,
      });
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        throw new UnauthenticatedError('Organization context required');
      }

      const experiments = await experimentsService.listExperiments(organizationId);

      res.status(200).json({
        data: experiments,
      });
    } catch (err) {
      next(err);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        throw new UnauthenticatedError('Organization context required');
      }

      const experimentId = req.params.id as string;
      const experiment = await experimentsService.getExperimentById(organizationId, experimentId);

      res.status(200).json({
        data: experiment,
      });
    } catch (err) {
      next(err);
    }
  }

  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        throw new UnauthenticatedError('Organization context required');
      }

      const experimentId = req.params.id as string;
      const validated = updateExperimentStatusSchema.parse(req.body);
      const experiment = await experimentsService.updateStatus(
        organizationId,
        experimentId,
        validated.status
      );

      res.status(200).json({
        data: experiment,
      });
    } catch (err) {
      next(err);
    }
  }

  async assign(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        throw new UnauthenticatedError('Organization context required');
      }

      const experimentId = req.params.id as string;
      const validated = assignExperimentRequestSchema.parse(req.body);
      const result = await experimentsService.assign(
        organizationId,
        experimentId,
        validated.subjectKey
      );

      res.status(200).json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  async convert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = req.organizationId;
      if (!organizationId) {
        throw new UnauthenticatedError('Organization context required');
      }

      const experimentId = req.params.id as string;
      const validated = convertExperimentRequestSchema.parse(req.body);
      const result = await experimentsService.convert(
        organizationId,
        experimentId,
        validated.subjectKey
      );

      res.status(200).json({
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}

export const experimentsController = new ExperimentsController();
