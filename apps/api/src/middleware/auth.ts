import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { Role } from '@talentpulse/shared';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { UnauthenticatedError, ForbiddenError } from '../lib/errors/AppError';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  organizationId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      organizationId?: string;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthenticatedError('Missing or invalid Authorization header');
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser;
    req.user = payload;
    req.organizationId = payload.organizationId;
    next();
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new UnauthenticatedError('Access token has expired');
    }
    throw new UnauthenticatedError('Invalid access token');
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthenticatedError('User is not authenticated');
    }
    if (!roles.includes(req.user.role)) {
      throw new ForbiddenError(`Role ${req.user.role} is not authorized for this action`);
    }
    next();
  };
}

export async function authenticateKeyOrJwt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const apiKey = req.headers['x-api-key'];
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
      const keyRecord = await prisma.apiKey.findUnique({
        where: { keyHash },
      });

      if (!keyRecord || keyRecord.revokedAt) {
        throw new UnauthenticatedError('Invalid or revoked API key');
      }

      // Update last used timestamp
      await prisma.apiKey.update({
        where: { id: keyRecord.id },
        data: { lastUsedAt: new Date() },
      });

      req.organizationId = keyRecord.organizationId;
      next();
      return;
    }

    authenticate(req, res, next);
  } catch (error) {
    next(error);
  }
}
