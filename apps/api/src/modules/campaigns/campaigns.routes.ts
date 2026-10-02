import { Router } from 'express';
import { campaignsController } from './campaigns.controller';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', authorize('ADMIN', 'RECRUITER', 'ANALYST'), (req, res, next) => {
  campaignsController.list(req, res, next);
});

router.post('/', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  campaignsController.create(req, res, next);
});

router.get('/:id', authorize('ADMIN', 'RECRUITER', 'ANALYST'), (req, res, next) => {
  campaignsController.get(req, res, next);
});

router.patch('/:id', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  campaignsController.update(req, res, next);
});

router.get('/:id/allocations', authorize('ADMIN', 'RECRUITER', 'ANALYST'), (req, res, next) => {
  campaignsController.getAllocations(req, res, next);
});

router.put('/:id/allocations', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  campaignsController.setAllocations(req, res, next);
});

router.post('/:id/spend', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  campaignsController.recordSpend(req, res, next);
});

export default router;
