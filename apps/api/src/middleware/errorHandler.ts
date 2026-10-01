import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors/AppError';
import { getRequestId } from './requestContext';
import { logger } from '../lib/logger';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const requestId = getRequestId();

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err, requestId }, err.message);
    }

    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        requestId,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));

    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details,
        requestId,
      },
    });
    return;
  }

  logger.error({ err, requestId }, 'Unhandled exception');

  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'An internal server error occurred',
      requestId,
    },
  });
}
