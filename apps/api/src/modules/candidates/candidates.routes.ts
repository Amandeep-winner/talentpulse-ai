import { Router } from 'express';
import { z } from 'zod';
import {
  createCandidateRequestSchema,
  updateCandidateRequestSchema,
  candidateFilterQuerySchema,
} from '@talentpulse/shared';
import { candidatesController, upload } from './candidates.controller';
import { embeddingController } from '../embeddings/embedding.controller';
import { authenticate, authorize } from '../../middleware/auth';
import { validate } from '../../middleware/validate';

const idParamSchema = z.object({
  id: z.string().uuid('Invalid candidate ID format'),
});

const router = Router();

router.use(authenticate);

// Reads: ADMIN, RECRUITER, ANALYST
router.get('/', validate({ query: candidateFilterQuerySchema }), (req, res, next) => {
  candidatesController.list(req, res, next);
});

router.get('/:id', validate({ params: idParamSchema }), (req, res, next) => {
  candidatesController.get(req, res, next);
});

// Writes: ADMIN, RECRUITER (ANALYST forbidden)
router.post(
  '/',
  authorize('ADMIN', 'RECRUITER'),
  validate({ body: createCandidateRequestSchema }),
  (req, res, next) => {
    candidatesController.create(req, res, next);
  },
);

router.patch(
  '/:id',
  authorize('ADMIN', 'RECRUITER'),
  validate({ params: idParamSchema, body: updateCandidateRequestSchema }),
  (req, res, next) => {
    candidatesController.update(req, res, next);
  },
);

router.delete(
  '/:id',
  authorize('ADMIN', 'RECRUITER'),
  validate({ params: idParamSchema }),
  (req, res, next) => {
    candidatesController.delete(req, res, next);
  },
);

router.post(
  '/:id/resume',
  authorize('ADMIN', 'RECRUITER'),
  validate({ params: idParamSchema }),
  upload.single('resume'),
  (req, res, next) => {
    candidatesController.uploadResume(req, res, next);
  },
);

router.post(
  '/:id/embed',
  authorize('ADMIN', 'RECRUITER'),
  validate({ params: idParamSchema }),
  (req, res, next) => {
    embeddingController.embedCandidate(req, res, next);
  },
);

export const candidatesRoutes = router;
