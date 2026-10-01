import { Router } from 'express';
import { z } from 'zod';
import { createUserRequestSchema, updateUserRoleSchema } from '@talentpulse/shared';
import { usersController } from './users.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const idParamSchema = z.object({
  id: z.string().uuid('Invalid user ID format'),
});

const router = Router();

// All users routes require ADMIN role
router.use(authenticate, authorize('ADMIN'));

router.get('/', (req, res, next) => {
  usersController.list(req, res, next);
});

router.post('/', validate({ body: createUserRequestSchema }), (req, res, next) => {
  usersController.create(req, res, next);
});

router.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUserRoleSchema }),
  (req, res, next) => {
    usersController.updateRole(req, res, next);
  },
);

router.delete('/:id', validate({ params: idParamSchema }), (req, res, next) => {
  usersController.delete(req, res, next);
});

export const usersRoutes = router;
