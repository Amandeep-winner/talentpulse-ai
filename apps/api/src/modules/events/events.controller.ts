import { Request, Response, NextFunction } from 'express';
import { eventsBatchRequestSchema, eventInputSchema, EventInput } from '@talentpulse/shared';
import { eventsService } from './events.service';
import { UnauthenticatedError, ValidationError } from '../../lib/errors/AppError';

export class EventsController {
  async ingest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.organizationId || req.user?.organizationId;
      if (!orgId) {
        throw new UnauthenticatedError('Organization context required');
      }

      let eventsToIngest: EventInput[] = [];

      // Check if body is an array directly
      if (Array.isArray(req.body)) {
        if (req.body.length > 500) {
          throw new ValidationError('Batch size cannot exceed 500 events');
        }
        eventsToIngest = req.body.map((item) => eventInputSchema.parse(item));
      } else {
        const parsed = eventsBatchRequestSchema.parse(req.body);
        if ('events' in parsed && Array.isArray(parsed.events)) {
          eventsToIngest = parsed.events;
        } else {
          eventsToIngest = [parsed as EventInput];
        }
      }

      const result = await eventsService.ingestEvents(orgId, eventsToIngest);
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.organizationId || req.user?.organizationId;
      if (!orgId) {
        throw new UnauthenticatedError('Organization context required');
      }

      const result = await eventsService.listEvents(orgId, {
        campaignId: req.query.campaignId as string | undefined,
        publisherId: req.query.publisherId as string | undefined,
        eventType: req.query.eventType as string | undefined,
        page: Number(req.query.page) || 1,
        pageSize: Number(req.query.pageSize) || 20,
      });

      res.status(200).json({
        data: result.events,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const eventsController = new EventsController();
