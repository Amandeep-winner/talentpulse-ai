import { AiIntent, AiChartSpec, KnowledgeCitation } from '@talentpulse/shared';

export interface AiPipelineContext {
  organizationId: string;
  userId: string;
  conversationId?: string;
  question: string;
}

export interface AiStepLog {
  agent: string;
  tool: string;
  argsHash: string;
  latencyMs: number;
  success: boolean;
  error?: string;
}

export interface MetricDiagnosisResult {
  metric: string;
  period: string;
  overallChange: {
    previous: number;
    current: number;
    changePct: number;
  };
  primaryDriver: {
    publisherName: string;
    publisherType: string;
    metric: string;
    previousValue: number;
    currentValue: number;
    dropPct: number;
    details: string;
  };
  publisherBreakdown: Array<{
    name: string;
    previous: number;
    current: number;
    changePct: number;
  }>;
  recommendations: string[];
  chart?: AiChartSpec;
}

export interface AiPipelineOutput {
  conversationId: string;
  messageId: string;
  answer: string;
  intent: AiIntent;
  steps: string[];
  sql?: string;
  rows?: Array<Record<string, unknown>>;
  chart?: AiChartSpec;
  recommendations?: string[];
  citations?: KnowledgeCitation[];
  confidence: number;
}
