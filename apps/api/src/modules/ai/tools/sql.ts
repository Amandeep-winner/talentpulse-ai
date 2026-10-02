import { AiChartSpec } from '@talentpulse/shared';
import { executeSafeSqlPipeline } from '../sql';

export interface SqlQueryResult {
  answer: string;
  sql: string;
  rows: Array<Record<string, unknown>>;
  rowCount?: number;
  executionTimeMs?: number;
  chart?: AiChartSpec;
  recommendations?: string[];
  confidence?: number;
}

export async function executeAnalyticalQuery(
  orgId: string,
  question: string,
  customSql?: string
): Promise<SqlQueryResult> {
  const result = await executeSafeSqlPipeline(orgId, question, customSql);
  return {
    answer: result.answer,
    sql: result.sql,
    rows: result.rows,
    rowCount: result.rowCount,
    executionTimeMs: result.executionTimeMs,
    chart: result.chart,
    recommendations: result.recommendations,
    confidence: result.confidence,
  };
}
