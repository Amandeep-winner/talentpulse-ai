import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { classifyIntent } from './classifier';
import { diagnoseMetricChange } from './tools/diagnose';
import { executeAnalyticalQuery } from './tools/sql';
import { searchCandidatesTool } from './tools/candidateSearch';
import { knowledgeService } from '../knowledge/knowledge.service';
import { AiPipelineContext, AiPipelineOutput } from './types';
import { AiIntent, AiChartSpec, KnowledgeCitation } from '@talentpulse/shared';

function hashArgs(args: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(args)).digest('hex').slice(0, 16);
}

export async function runAiPipeline(ctx: AiPipelineContext): Promise<AiPipelineOutput> {
  const { organizationId, userId, question } = ctx;
  const steps: string[] = [];
  const toolCallIds: string[] = [];

  // Helper to record tool calls
  async function recordTool<T>(agent: string, tool: string, args: unknown, fn: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    const argsHash = hashArgs(args);
    try {
      const result = await fn();
      const latencyMs = Date.now() - startTime;
      const tc = await prisma.aiToolCall.create({
        data: {
          organizationId,
          agent,
          tool,
          argsHash,
          latencyMs,
          success: true,
        },
      });
      toolCallIds.push(tc.id);
      return result;
    } catch (err: unknown) {
      const latencyMs = Date.now() - startTime;
      const errorMsg = err instanceof Error ? err.message : 'Unknown tool execution error';
      const tc = await prisma.aiToolCall.create({
        data: {
          organizationId,
          agent,
          tool,
          argsHash,
          latencyMs,
          success: false,
          error: `AI_INVALID_OUTPUT: ${errorMsg}`,
        },
      });
      toolCallIds.push(tc.id);
      throw err;
    }
  }

  // 1. Resolve or create AiConversation
  let conversationId = ctx.conversationId;
  if (!conversationId) {
    const title = question.length > 40 ? `${question.slice(0, 40).trim()}...` : question;
    const conversation = await prisma.aiConversation.create({
      data: {
        organizationId,
        userId,
        title,
      },
    });
    conversationId = conversation.id;
  } else {
    // Verify conversation exists and belongs to organization
    const existing = await prisma.aiConversation.findFirst({
      where: { id: conversationId, organizationId },
    });
    if (!existing) {
      const title = question.length > 40 ? `${question.slice(0, 40).trim()}...` : question;
      const conversation = await prisma.aiConversation.create({
        data: {
          organizationId,
          userId,
          title,
        },
      });
      conversationId = conversation.id;
    }
  }

  // 2. Persist user message
  await prisma.aiMessage.create({
    data: {
      conversationId,
      role: 'user',
      content: question,
    },
  });

  // 3. Step 1: Intent Classification
  steps.push('Analyzing query intent');
  const intent: AiIntent = await recordTool(
    'router',
    'classify_intent',
    { question },
    async () => classifyIntent(question)
  );
  steps.push(`Classified intent as "${intent}"`);

  let answer = '';
  let sql: string | undefined;
  let rows: Array<Record<string, unknown>> | undefined;
  let chart: AiChartSpec | undefined;
  let recommendations: string[] | undefined;
  let citations: KnowledgeCitation[] | undefined;
  let confidence = 0.9;
  let executionTimeMs: number | undefined;
  let rowCount: number | undefined;

  // 4. Step 2: Route Execution
  switch (intent) {
    case 'metric_diagnosis': {
      steps.push('Executing metric diagnosis comparison (current vs previous 30 days)');
      const diag = await recordTool('analyst', 'diagnose_metric_change', { orgId: organizationId }, () =>
        diagnoseMetricChange(organizationId, 'applications', 30)
      );

      steps.push(
        `Identified ${diag.primaryDriver.publisherName} as primary contributor to metric shift`
      );

      answer = `Based on historical recruitment metrics comparing the current 30-day period against the previous 30-day period:

Total applications experienced a shift of **${diag.overallChange.changePct}%** (${diag.overallChange.previous} → ${diag.overallChange.current}).

The primary driver behind this decline is **${diag.primaryDriver.publisherName}**, where the ${diag.primaryDriver.metric} declined by **${Math.abs(diag.primaryDriver.dropPct)}%**. ${diag.primaryDriver.details}`;

      recommendations = diag.recommendations;
      chart = diag.chart;
      confidence = 0.95;
      break;
    }

    case 'knowledge': {
      steps.push('Querying RAG knowledge base with similarity threshold gating');
      const ragResult = await recordTool('knowledge', 'rag_ask', { question }, () =>
        knowledgeService.askQuestion(organizationId, { question })
      );

      steps.push(`Retrieved ${ragResult.citations.length} cited source passages`);
      answer = ragResult.answer;
      citations = ragResult.citations;
      confidence = ragResult.citations.length > 0 ? 0.92 : 0.6;
      break;
    }

    case 'candidate_search': {
      steps.push('Executing semantic candidate vector search in talent directory');
      const searchResult = await recordTool('candidate_matcher', 'search_candidates', { question }, () =>
        searchCandidatesTool(organizationId, question)
      );

      steps.push(`Found ${searchResult.candidates.length} matching candidates`);
      answer = searchResult.answer;
      rows = searchResult.candidates;
      confidence = 0.88;
      break;
    }

    case 'analytics_sql': {
      steps.push('Synthesizing SQL query from schema context and templates');
      const sqlResult = await recordTool('sql_engine', 'execute_sql', { question }, () =>
        executeAnalyticalQuery(organizationId, question)
      );

      steps.push(
        `Validated AST, enforced tenant isolation, and executed in ${sqlResult.executionTimeMs ?? 0}ms (${sqlResult.rowCount ?? sqlResult.rows.length} rows)`
      );
      answer = sqlResult.answer;
      sql = sqlResult.sql;
      rows = sqlResult.rows;
      chart = sqlResult.chart;
      recommendations = sqlResult.recommendations;
      confidence = sqlResult.confidence ?? 0.94;
      executionTimeMs = sqlResult.executionTimeMs;
      rowCount = sqlResult.rowCount ?? sqlResult.rows.length;
      break;
    }

    case 'campaign_recommendation': {
      steps.push('Consulting campaign optimization engine');
      answer =
        'Campaign budget optimization and automated allocation models are scheduled for Task 19. You can review current allocations on the Campaigns page or run a Metric Diagnosis to assess publisher ROI.';
      confidence = 0.85;
      break;
    }

    case 'smalltalk': {
      steps.push('Providing platform conversational guidance');
      answer =
        'Hello! I am your TalentPulse AI Conversational Analyst. You can ask me to diagnose recruitment metric shifts, evaluate publisher CPA and spend, query internal hiring policies and handbooks, or search for candidates matching specific technical skills.';
      confidence = 1.0;
      break;
    }

    case 'unsupported':
    default: {
      steps.push('Evaluating against supported talent acquisition capabilities');
      answer =
        'I specialize in talent acquisition analytics, recruitment metric diagnosis, policy handbook retrieval, and candidate vector search. Please try asking about application drops, publisher performance, interview rubrics, or candidate qualifications.';
      confidence = 0.7;
      break;
    }
  }

  // 5. Persist assistant message
  const payload = {
    answer,
    intent,
    steps,
    sql,
    rows,
    chart,
    recommendations,
    citations,
    confidence,
    executionTimeMs,
    rowCount,
  };

  const assistantMessage = await prisma.aiMessage.create({
    data: {
      conversationId,
      role: 'assistant',
      content: answer,
      payload: JSON.parse(JSON.stringify(payload)),
    },
  });

  // 6. Link tool calls to assistant message
  if (toolCallIds.length > 0) {
    await prisma.aiToolCall.updateMany({
      where: { id: { in: toolCallIds } },
      data: { messageId: assistantMessage.id },
    });
  }

  return {
    conversationId,
    messageId: assistantMessage.id,
    answer,
    intent,
    steps,
    sql,
    rows,
    chart,
    recommendations,
    citations,
    confidence,
    executionTimeMs,
    rowCount,
  };
}
