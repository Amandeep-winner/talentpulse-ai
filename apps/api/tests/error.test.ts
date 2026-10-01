import request from 'supertest';
import express from 'express';
import { createApp } from '../src/app';
import { ValidationError, ForbiddenError } from '../src/lib/errors/AppError';
import { errorHandler } from '../src/middleware/errorHandler';
import { requestContextMiddleware } from '../src/middleware/requestContext';

describe('Error Handling Middleware', () => {
  const app = createApp();

  it('GET /api/unknown-route returns 404 in standard error format', async () => {
    const res = await request(app).get('/api/unknown-route');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).toMatchObject({
      code: 'NOT_FOUND',
      message: expect.stringContaining('Route GET /api/unknown-route not found'),
      requestId: expect.any(String),
    });
  });

  it('handles ValidationError with details and requestId', async () => {
    const testApp = express();
    testApp.use(requestContextMiddleware);
    testApp.get('/test-validation-error', () => {
      throw new ValidationError('Invalid request payload', [
        { path: 'email', message: 'Email is required' },
      ]);
    });
    testApp.use(errorHandler);

    const res = await request(testApp).get('/test-validation-error');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: [{ path: 'email', message: 'Email is required' }],
        requestId: expect.any(String),
      },
    });
  });

  it('handles ForbiddenError with 403 status', async () => {
    const testApp = express();
    testApp.use(requestContextMiddleware);
    testApp.get('/test-forbidden', () => {
      throw new ForbiddenError('Action not permitted for ANALYST role');
    });
    testApp.use(errorHandler);

    const res = await request(testApp).get('/test-forbidden');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({
      code: 'FORBIDDEN',
      message: 'Action not permitted for ANALYST role',
      requestId: expect.any(String),
    });
  });
});
