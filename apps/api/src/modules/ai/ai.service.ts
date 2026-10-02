import { prisma } from '../../lib/prisma';
import { runAiPipeline } from './pipeline';
import { NotFoundError } from '../../lib/errors/AppError';
import { AiPipelineOutput } from './types';

export class AiService {
  async query(
    orgId: string,
    userId: string,
    options: { question: string; conversationId?: string }
  ): Promise<AiPipelineOutput> {
    return runAiPipeline({
      organizationId: orgId,
      userId,
      question: options.question,
      conversationId: options.conversationId,
    });
  }

  async listConversations(orgId: string, userId: string) {
    const list = await prisma.aiConversation.findMany({
      where: { organizationId: orgId, userId },
      include: {
        _count: {
          select: { messages: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return list.map((c) => ({
      id: c.id,
      organizationId: c.organizationId,
      userId: c.userId,
      title: c.title,
      createdAt: c.createdAt,
      messageCount: c._count.messages,
    }));
  }

  async getConversation(id: string, orgId: string, userId: string) {
    const conversation = await prisma.aiConversation.findFirst({
      where: { id, organizationId: orgId, userId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            toolCalls: {
              select: {
                id: true,
                agent: true,
                tool: true,
                latencyMs: true,
                success: true,
                error: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    return conversation;
  }

  async deleteConversation(id: string, orgId: string, userId: string) {
    const conversation = await prisma.aiConversation.findFirst({
      where: { id, organizationId: orgId, userId },
    });

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    await prisma.aiConversation.delete({
      where: { id: conversation.id },
    });

    return { success: true };
  }
}

export const aiService = new AiService();
