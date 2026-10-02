import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { embeddingController } from '../embeddings/embedding.controller';

const router = Router();

router.use(authenticate);

// Admin-only operations
router.post('/reindex', authorize('ADMIN'), (req, res, next) => {
  embeddingController.reindexAll(req, res, next);
});

export const adminRoutes = router;
export default adminRoutes;
