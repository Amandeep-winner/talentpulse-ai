import { validateSql } from './validator';
import { executeReadOnlySql } from './executor';
import { matchSqlTemplate } from './templates';
import { analyzeSqlResult } from './analyzer';
import { SqlRejectedError } from '../../../lib/errors/AppError';
import { AiChartSpec } from '@talentpulse/shared';

export * from './schema';
export * from './validator';
export * from './executor';
export * from './templates';
export * from './analyzer';

export interface SafeSqlPipelineResult {
  sql: string;
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  executionTimeMs: number;
  answer: string;
  recommendations: string[];
  chart?: AiChartSpec;
  confidence: number;
}

/**
 * End-to-end safe Text-to-SQL pipeline:
 * 1. Generates or receives SQL candidate
 * 2. AST validates against whitelist and security guardrails
 * 3. Injects LIMIT if needed
 * 4. Executes on dedicated read-only role with statement_timeout and tenant GUC
 * 5. Analyzes rows to produce executive answer, recommendations, and chart spec
 */
export async function executeSafeSqlPipeline(
  organizationId: string,
  question: string,
  customSql?: string
): Promise<SafeSqlPipelineResult> {
  let candidateSql: string;

  if (customSql && customSql.trim().length > 0) {
    candidateSql = customSql.trim();
  } else {
    // Select deterministic template from library
    const template = matchSqlTemplate(question);
    candidateSql = template.generateSql();
  }

  // 1. AST Validation
  const validation = validateSql(candidateSql);
  if (!validation.valid) {
    throw new SqlRejectedError(validation.error);
  }

  const validatedSql = validation.sql;

  // 2. Execution with read-only pool, statement_timeout, and tenant GUC
  const execution = await executeReadOnlySql(organizationId, validatedSql, 5000);

  // 3. Result Analysis
  const analysis = analyzeSqlResult(question, validatedSql, execution.rows);

  return {
    sql: validatedSql,
    rows: execution.rows,
    rowCount: execution.rowCount,
    executionTimeMs: execution.executionTimeMs,
    answer: analysis.answer,
    recommendations: analysis.recommendations,
    chart: analysis.chart,
    confidence: analysis.confidence,
  };
}
