import { Request, Response, NextFunction } from 'express';
import {
  createPublisherRequestSchema,
  updatePublisherRequestSchema,
} from '@talentpulse/shared';
import { publishersService } from './publishers.service';

export class PublishersController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const publishers = await publishersService.listPublishers(req.user!.organizationId);
      res.status(200).json({ data: publishers });
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const publisher = await publishersService.getPublisher(
        req.user!.organizationId,
        req.params.id as string,
      );
      res.status(200).json({ data: publisher });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedBody = createPublisherRequestSchema.parse(req.body);
      const publisher = await publishersService.createPublisher(
        req.user!.organizationId,
        parsedBody,
      );
      res.status(201).json({ data: publisher });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedBody = updatePublisherRequestSchema.parse(req.body);
      const updated = await publishersService.updatePublisher(
        req.user!.organizationId,
        req.params.id as string,
        parsedBody,
      );
      res.status(200).json({ data: updated });
    } catch (error) {
      next(error);
    }
  }
}

export const publishersController = new PublishersController();
