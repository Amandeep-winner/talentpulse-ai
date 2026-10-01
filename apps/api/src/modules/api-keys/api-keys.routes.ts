import { Router } from 'express';
import { z } from 'zod';
import { createApiKeyRequestSchema } from '@talentpulse/shared';
import { apiKeysController } from './api-keys.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const idParamSchema = z.object({
  id: z.string().uuid('Invalid API key ID format'),
});

const router = Router();

// All API keys routes require ADMIN role
router.use(authenticate, authorize('ADMIN'));

router.post('/', validate({ body: createApiKeyRequestSchema }), (req, res, next) => {
  apiKeysController.create(req, res, next);
});

router.get('/', (req, res, next) => {
  apiKeysController.list(req, res, next);
});

router.delete('/:id', validate({ params: idParamSchema }), (req, res, next) => {
  apiKeysController.revoke(req, res, next);
});

export const apiKeysRoutes = router;
