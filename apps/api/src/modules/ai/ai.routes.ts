import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../../middleware/auth';
import { aiController } from './ai.controller';

const router = Router();

// All AI endpoints require authentication
router.use(authenticate);

// AI query rate limiting: 60 queries per 15 min per IP/user
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many AI analyst queries. Please wait a few moments before trying again.',
    },
  },
});

router.post('/query', aiLimiter, (req, res, next) => {
  aiController.query(req, res).catch(next);
});

router.post('/sql/preview', (req, res, next) => {
  aiController.previewSql(req, res).catch(next);
});

router.get('/conversations', (req, res, next) => {
  aiController.listConversations(req, res).catch(next);
});

router.get('/conversations/:id', (req, res, next) => {
  aiController.getConversation(req, res).catch(next);
});

router.delete('/conversations/:id', (req, res, next) => {
  aiController.deleteConversation(req, res).catch(next);
});

export const aiRouter = router;
