import { Router } from 'express';
import { mlController } from './ml.controller';
import { authenticate, authorize } from '../../middleware/auth';

export const mlRouter = Router();

// All routes require authentication
mlRouter.use(authenticate);

// Training: ADMIN only
mlRouter.post('/train', authorize('ADMIN'), (req, res, next) => mlController.train(req, res, next));

// Inference: all roles
mlRouter.post('/predict/application', (req, res, next) => mlController.predictApplication(req, res, next));
mlRouter.post('/predict/fill', (req, res, next) => mlController.predictFill(req, res, next));

// Models registry inspection
mlRouter.get('/models', (req, res, next) => mlController.listModels(req, res, next));
