import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import client from 'prom-client';
import { env } from './config/env';
import { requestContextMiddleware } from './middleware/requestContext';
import { httpLogger } from './lib/logger';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { checkDatabaseConnection } from './lib/prisma';
import { checkRedisConnection } from './lib/redis';
import { authRoutes } from './modules/auth/auth.routes';
import { usersRoutes } from './modules/users/users.routes';
import { apiKeysRoutes } from './modules/api-keys/api-keys.routes';
import { jobsRoutes } from './modules/jobs/jobs.routes';
import { candidatesRoutes } from './modules/candidates/candidates.routes';
import applicationsRoutes from './modules/applications/applications.routes';
import publishersRoutes from './modules/publishers/publishers.routes';
import campaignsRoutes from './modules/campaigns/campaigns.routes';
import eventsRoutes from './modules/events/events.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import { authenticateKeyOrJwt } from './middleware/auth';

// Initialize Prometheus default metrics collection once
client.collectDefaultMetrics({ prefix: 'talentpulse_' });

export function createApp(): Express {
  const app = express();

  // Security headers & CORS
  app.use(helmet());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-api-key'],
    }),
  );

  // Request context & HTTP logging
  app.use(requestContextMiddleware);
  if (env.NODE_ENV !== 'test') {
    app.use(httpLogger);
  }

  // Rate limiting (global 300 per 15m)
  const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests from this IP, please try again after 15 minutes',
      },
    },
  });
  app.use(globalLimiter);

  // Body parsing & cookies
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Observability & Health endpoints
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime(),
    });
  });

  app.get('/ready', async (_req, res) => {
    const isDbConnected = await checkDatabaseConnection();
    const isRedisConnected = await checkRedisConnection();
    const isReady = isDbConnected && isRedisConnected;

    res.status(isReady ? 200 : 503).json({
      status: isReady ? 'ready' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        api: 'healthy',
        database: isDbConnected ? 'connected' : 'disconnected',
        redis: isRedisConnected ? 'connected' : 'disconnected',
      },
    });
  });

  app.get('/metrics', async (_req, res) => {
    try {
      res.set('Content-Type', client.register.contentType);
      res.end(await client.register.metrics());
    } catch (err) {
      res.status(500).end(err);
    }
  });

  // API Modules
  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api/api-keys', apiKeysRoutes);
  app.use('/api/jobs', jobsRoutes);
  app.use('/api/candidates', candidatesRoutes);
  app.use('/api/applications', applicationsRoutes);
  app.use('/api/publishers', publishersRoutes);
  app.use('/api/campaigns', campaignsRoutes);
  app.use('/api/events', eventsRoutes);
  app.use('/api/analytics', analyticsRoutes);

  if (env.NODE_ENV === 'test') {
    app.get('/api/test-key-auth', authenticateKeyOrJwt, (req, res) => {
      res.status(200).json({
        data: {
          organizationId: req.organizationId,
          user: req.user,
        },
      });
    });
  }

  // Catch-all 404 & Central Error Handler
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
