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

  async previewSql(orgId: string, sql: string) {
    const { validateSql, executeReadOnlySql } = await import('./sql');
    const validation = validateSql(sql);
    if (!validation.valid) {
      return {
        valid: false,
        reason: validation.error,
      };
    }

    try {
      const execution = await executeReadOnlySql(orgId, validation.sql, 5000);
      return {
        valid: true,
        sql: validation.sql,
        tables: validation.tables,
        executionTimeMs: execution.executionTimeMs,
        rowCount: execution.rowCount,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'SQL query execution failed';
      return {
        valid: false,
        sql: validation.sql,
        reason: message,
        tables: validation.tables,
      };
    }
  }
}

export const aiService = new AiService();
