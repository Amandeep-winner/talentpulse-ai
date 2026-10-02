import { Router } from 'express';
import { forecastController } from './forecast.controller';
import { authenticate } from '../../middleware/auth';

export const forecastRouter = Router();

// Forecast queries are accessible to all authenticated users
forecastRouter.use(authenticate);

forecastRouter.get('/', (req, res, next) => forecastController.getForecast(req, res, next));
