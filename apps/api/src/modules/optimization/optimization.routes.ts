import { Router } from 'express';
import { optimizationController } from './optimization.controller';
import { authenticate, authorize } from '../../middleware/auth';
import banditRoutes from './bandit/bandit.routes';
import experimentsRoutes from './experiments/experiments.routes';

const router = Router();

router.use(authenticate);

// Propose optimization recommendation (ADMIN, RECRUITER)
router.post('/propose', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  optimizationController.propose(req, res, next);
});

// List recommendations (ADMIN, RECRUITER, ANALYST)
router.get('/recommendations', authorize('ADMIN', 'RECRUITER', 'ANALYST'), (req, res, next) => {
  optimizationController.list(req, res, next);
});

// Get recommendation by ID (ADMIN, RECRUITER, ANALYST)
router.get('/recommendations/:id', authorize('ADMIN', 'RECRUITER', 'ANALYST'), (req, res, next) => {
  optimizationController.getById(req, res, next);
});

// Approve recommendation (ADMIN, RECRUITER) - ANALYST blocked by authorize and in service
router.post('/recommendations/:id/approve', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  optimizationController.approve(req, res, next);
});

// Reject recommendation (ADMIN, RECRUITER)
router.post('/recommendations/:id/reject', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  optimizationController.reject(req, res, next);
});

// Sub-routes for Contextual Bandit
router.use('/bandit', banditRoutes);

// Sub-routes for A/B Experiments
router.use('/experiments', experimentsRoutes);

export default router;
