import { Router } from 'express';
import { experimentsController } from './experiments.controller';
import { authenticate, authorize } from '../../../middleware/auth';

const router = Router();

router.use(authenticate);

// Create experiment (ADMIN, RECRUITER)
router.post('/', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  experimentsController.create(req, res, next);
});

// List experiments (ADMIN, RECRUITER, ANALYST)
router.get('/', authorize('ADMIN', 'RECRUITER', 'ANALYST'), (req, res, next) => {
  experimentsController.list(req, res, next);
});

// Get experiment results (ADMIN, RECRUITER, ANALYST)
router.get('/:id', authorize('ADMIN', 'RECRUITER', 'ANALYST'), (req, res, next) => {
  experimentsController.getById(req, res, next);
});

// Update experiment status (ADMIN, RECRUITER)
router.patch('/:id/status', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  experimentsController.updateStatus(req, res, next);
});

// Assign subject to variant (ADMIN, RECRUITER)
router.post('/:id/assign', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  experimentsController.assign(req, res, next);
});

// Record conversion (ADMIN, RECRUITER)
router.post('/:id/convert', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  experimentsController.convert(req, res, next);
});

export default router;
