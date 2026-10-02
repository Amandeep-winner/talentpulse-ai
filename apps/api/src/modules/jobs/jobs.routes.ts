import { Router } from 'express';
import { z } from 'zod';
import { createJobRequestSchema, updateJobRequestSchema, jobFilterQuerySchema } from '@talentpulse/shared';
import { jobsController } from './jobs.controller';
import { embeddingController } from '../embeddings/embedding.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const idParamSchema = z.object({
  id: z.string().uuid('Invalid job ID format'),
});

const router = Router();

router.use(authenticate);

// Reads: ADMIN, RECRUITER, ANALYST
router.get('/', validate({ query: jobFilterQuerySchema }), (req, res, next) => {
  jobsController.list(req, res, next);
});

router.get('/:id', validate({ params: idParamSchema }), (req, res, next) => {
  jobsController.get(req, res, next);
});

// Writes: ADMIN, RECRUITER (ANALYST forbidden)
router.post(
  '/',
  authorize('ADMIN', 'RECRUITER'),
  validate({ body: createJobRequestSchema }),
  (req, res, next) => {
    jobsController.create(req, res, next);
  },
);

router.patch(
  '/:id',
  authorize('ADMIN', 'RECRUITER'),
  validate({ params: idParamSchema, body: updateJobRequestSchema }),
  (req, res, next) => {
    jobsController.update(req, res, next);
  },
);

router.delete(
  '/:id',
  authorize('ADMIN', 'RECRUITER'),
  validate({ params: idParamSchema }),
  (req, res, next) => {
    jobsController.delete(req, res, next);
  },
);

router.post(
  '/:id/embed',
  authorize('ADMIN', 'RECRUITER'),
  validate({ params: idParamSchema }),
  (req, res, next) => {
    embeddingController.embedJob(req, res, next);
  },
);

export const jobsRoutes = router;
