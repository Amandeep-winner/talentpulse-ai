import { Request, Response } from 'express';
import { aiService } from './ai.service';
import { aiQueryRequestSchema } from '@talentpulse/shared';

export class AiController {
  async query(req: Request, res: Response) {
    const orgId = req.user!.organizationId;
    const userId = req.user!.id;
    const validated = aiQueryRequestSchema.parse(req.body);

    const result = await aiService.query(orgId, userId, {
      question: validated.question,
      conversationId: validated.conversationId,
    });

    res.json({ data: result });
  }

  async listConversations(req: Request, res: Response) {
    const orgId = req.user!.organizationId;
    const userId = req.user!.id;
    const list = await aiService.listConversations(orgId, userId);
    res.json({ data: list });
  }

  async getConversation(req: Request, res: Response) {
    const orgId = req.user!.organizationId;
    const userId = req.user!.id;
    const id = req.params.id as string;
    const conversation = await aiService.getConversation(id, orgId, userId);
    res.json({ data: conversation });
  }

  async deleteConversation(req: Request, res: Response) {
    const orgId = req.user!.organizationId;
    const userId = req.user!.id;
    const id = req.params.id as string;
    await aiService.deleteConversation(id, orgId, userId);
    res.json({ message: 'Conversation deleted successfully' });
  }
}

export const aiController = new AiController();
