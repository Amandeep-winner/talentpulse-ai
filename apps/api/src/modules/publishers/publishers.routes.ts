import { Router } from 'express';
import { publishersController } from './publishers.controller';
import { authenticate, authorize } from '../../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', authorize('ADMIN', 'RECRUITER', 'ANALYST'), (req, res, next) => {
  publishersController.list(req, res, next);
});

router.get('/:id', authorize('ADMIN', 'RECRUITER', 'ANALYST'), (req, res, next) => {
  publishersController.get(req, res, next);
});

router.post('/', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  publishersController.create(req, res, next);
});

router.patch('/:id', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  publishersController.update(req, res, next);
});

export default router;
