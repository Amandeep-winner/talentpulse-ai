import { Request, Response, NextFunction } from 'express';
import { apiKeysService } from './api-keys.service';

export class ApiKeysController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await apiKeysService.createKey(req.user!.organizationId, req.body);
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const keys = await apiKeysService.listKeys(req.user!.organizationId);
      res.status(200).json({ data: keys });
    } catch (error) {
      next(error);
    }
  }

  async revoke(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await apiKeysService.revokeKey(req.user!.organizationId, req.params.id as string);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const apiKeysController = new ApiKeysController();
