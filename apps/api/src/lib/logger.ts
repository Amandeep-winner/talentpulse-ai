import pino from 'pino';
import pinoHttp from 'pino-http';
import crypto from 'crypto';
import { env } from '../config/env';
import { getRequestContext } from '../middleware/requestContext';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  formatters: {
    log(object) {
      const context = getRequestContext();
      if (context) {
        return {
          ...object,
          request_id: context.requestId,
          user_id: context.userId,
          org_id: context.orgId,
        };
      }
      return object;
    },
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'password', 'token', 'apiKey'],
    censor: '[REDACTED]',
  },
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => {
    const headerId = req.headers['x-request-id'];
    if (typeof headerId === 'string' && headerId.length > 0) {
      return headerId;
    }
    return crypto.randomUUID();
  },
  customLogLevel: (_req, res, err) => {
    if (res.statusCode >= 500 || err) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res, responseTime) => {
    return `${req.method} ${req.url} ${res.statusCode} in ${responseTime}ms`;
  },
});
