import { Router } from 'express';
import { applicationsController } from './applications.controller';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', authorize('ADMIN', 'RECRUITER', 'ANALYST'), (req, res, next) => {
  applicationsController.list(req, res, next);
});

router.get('/:id', authorize('ADMIN', 'RECRUITER', 'ANALYST'), (req, res, next) => {
  applicationsController.get(req, res, next);
});

router.post('/', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  applicationsController.create(req, res, next);
});

router.patch('/:id', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  applicationsController.updateStatus(req, res, next);
});

router.delete('/:id', authorize('ADMIN'), (req, res, next) => {
  applicationsController.delete(req, res, next);
});

export default router;
