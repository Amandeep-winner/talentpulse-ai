import { Router } from 'express';
import { analyticsController } from './analytics.controller';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

router.use(authenticate);
router.use(authorize('ADMIN', 'RECRUITER', 'ANALYST'));

router.get('/overview', (req, res, next) => {
  analyticsController.getOverview(req, res, next);
});

router.get('/funnel', (req, res, next) => {
  analyticsController.getFunnel(req, res, next);
});

router.get('/timeseries', (req, res, next) => {
  analyticsController.getTimeSeries(req, res, next);
});

router.get('/publishers', (req, res, next) => {
  analyticsController.getPublishers(req, res, next);
});

router.get('/campaigns', (req, res, next) => {
  analyticsController.getCampaigns(req, res, next);
});

export default router;
