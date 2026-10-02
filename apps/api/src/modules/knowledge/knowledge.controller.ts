import { Request, Response } from 'express';
import { knowledgeService } from './knowledge.service';
import {
  createKnowledgeDocumentSchema,
  askKnowledgeRequestSchema,
} from '@talentpulse/shared';

export class KnowledgeController {
  async list(req: Request, res: Response) {
    const orgId = req.user!.organizationId;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const docs = await knowledgeService.listDocuments(orgId, category);
    res.json({ data: docs });
  }

  async getById(req: Request, res: Response) {
    const orgId = req.user!.organizationId;
    const id = req.params.id as string;
    const doc = await knowledgeService.getDocumentById(id, orgId);
    res.json({ data: doc });
  }

  async create(req: Request, res: Response) {
    const orgId = req.user!.organizationId;
    const validated = createKnowledgeDocumentSchema.parse(req.body);
    const doc = await knowledgeService.ingestDocument({
      orgId,
      title: validated.title,
      category: validated.category,
      content: validated.content,
    });
    res.status(201).json({ data: doc });
  }

  async delete(req: Request, res: Response) {
    const orgId = req.user!.organizationId;
    const id = req.params.id as string;
    await knowledgeService.deleteDocument(id, orgId);
    res.json({ message: 'Knowledge document deleted successfully' });
  }

  async ask(req: Request, res: Response) {
    const orgId = req.user!.organizationId;
    const validated = askKnowledgeRequestSchema.parse(req.body);
    const result = await knowledgeService.askQuestion(orgId, {
      question: validated.question,
      category: validated.category,
    });
    res.json({ data: result });
  }
}

export const knowledgeController = new KnowledgeController();
