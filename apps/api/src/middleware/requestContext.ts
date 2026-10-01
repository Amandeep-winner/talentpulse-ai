import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface RequestStore {
  requestId: string;
  userId?: string;
  orgId?: string;
}

export const requestStorage = new AsyncLocalStorage<RequestStore>();

export function getRequestContext(): RequestStore | undefined {
  return requestStorage.getStore();
}

export function getRequestId(): string {
  const store = requestStorage.getStore();
  return store?.requestId || 'req-untracked';
}

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const requestId = (typeof incomingId === 'string' && incomingId.length > 0)
    ? incomingId
    : crypto.randomUUID();

  res.setHeader('x-request-id', requestId);

  const store: RequestStore = {
    requestId,
  };

  requestStorage.run(store, () => {
    next();
  });
}
