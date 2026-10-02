import { Router } from 'express';
import { banditController } from './bandit.controller';
import { authenticate, authorize } from '../../../middleware/auth';

const router = Router();

router.use(authenticate);

// Decide action (ADMIN, RECRUITER)
router.post('/decide', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  banditController.decide(req, res, next);
});

// Reward feedback (ADMIN, RECRUITER)
router.post('/reward', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  banditController.reward(req, res, next);
});

// Run offline simulation (ADMIN, RECRUITER) - ANALYST blocked
router.post('/simulate', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  banditController.simulate(req, res, next);
});

// Get policy state (ADMIN, RECRUITER, ANALYST)
router.get('/state', authorize('ADMIN', 'RECRUITER', 'ANALYST'), (req, res, next) => {
  banditController.getState(req, res, next);
});

// Reset policy (ADMIN)
router.post('/reset', authorize('ADMIN'), (req, res, next) => {
  banditController.reset(req, res, next);
});

export default router;
