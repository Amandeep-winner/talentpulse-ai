import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth';
import { knowledgeController } from './knowledge.controller';

const router = Router();

// All knowledge endpoints require authentication
router.use(authenticate);

// Q&A endpoint
router.post('/ask', (req, res, next) => {
  knowledgeController.ask(req, res).catch(next);
});

// Document listing
router.get('/', (req, res, next) => {
  knowledgeController.list(req, res).catch(next);
});

// Document retrieval
router.get('/:id', (req, res, next) => {
  knowledgeController.getById(req, res).catch(next);
});

// Document creation (Admin or Recruiter)
router.post('/', authorize('ADMIN', 'RECRUITER'), (req, res, next) => {
  knowledgeController.create(req, res).catch(next);
});

// Document deletion (Admin only)
router.delete('/:id', authorize('ADMIN'), (req, res, next) => {
  knowledgeController.delete(req, res).catch(next);
});

export const knowledgeRouter = router;
