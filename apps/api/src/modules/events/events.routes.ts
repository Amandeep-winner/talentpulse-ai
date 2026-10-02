import { Router } from 'express';
import { eventsController } from './events.controller';
import { authenticateKeyOrJwt } from '../../middleware/auth';

const router = Router();

// Ingestion and event retrieval accepts either JWT Bearer or x-api-key
router.use(authenticateKeyOrJwt);

router.post('/', (req, res, next) => {
  eventsController.ingest(req, res, next);
});

router.get('/', (req, res, next) => {
  eventsController.list(req, res, next);
});

export default router;
