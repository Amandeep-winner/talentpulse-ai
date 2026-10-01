import { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../lib/errors/AppError';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
}
