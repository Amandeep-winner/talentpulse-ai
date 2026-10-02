import { AiChartSpec } from '@talentpulse/shared';
import { SQL_TEMPLATES } from './templates';

export interface AnalysisResult {
  answer: string;
  recommendations: string[];
  chart?: AiChartSpec;
  confidence: number;
}

/**
 * Analyzes SQL execution results to generate an executive-level natural language summary,
 * key insights, actionable recommendations, and visualization chart specifications.
 */
export function analyzeSqlResult(
  question: string,
  _sql: string,
  rows: Array<Record<string, unknown>>
): AnalysisResult {
  const q = question.toLowerCase();

  // 1. Check if question matches one of our rich domain templates
  for (const template of SQL_TEMPLATES) {
    if (template.matches(q)) {
      return template.narrate(rows, question);
    }
  }

  // 2. Generic analyzer for arbitrary safe SQL queries
  if (rows.length === 0) {
    return {
      answer: 'The query executed successfully but returned 0 rows matching your criteria.',
      recommendations: [
        'Try broadening the date filter or checking if campaign records exist for the selected period.',
        'Verify that your organization has active jobs or campaign data.',
      ],
      confidence: 0.85,
    };
  }

  const firstRow = rows[0];
  if (!firstRow) {
    return {
      answer: 'Query executed successfully with empty result set.',
      recommendations: [],
      confidence: 0.8,
    };
  }

  // Detect numeric and label fields
  const keys = Object.keys(firstRow);
  const numericKeys = keys.filter((k) => typeof firstRow[k] === 'number');
  const stringKeys = keys.filter((k) => typeof firstRow[k] === 'string');

  const labelKey = stringKeys[0] || keys[0] || 'record';
  const primaryMetric = numericKeys[0];

  let chart: AiChartSpec | undefined;
  if (numericKeys.length > 0 && labelKey) {
    chart = {
      type: 'bar',
      title: `Query Results: ${primaryMetric || 'Metrics'} by ${labelKey}`,
      xKey: labelKey,
      series: numericKeys.slice(0, 3),
      data: rows.slice(0, 10).map((r) => {
        const item: Record<string, unknown> = { [labelKey]: r[labelKey] };
        for (const numKey of numericKeys.slice(0, 3)) {
          item[numKey] = Number(r[numKey]);
        }
        return item;
      }),
    };
  }

  const answer = `Retrieved ${rows.length} records. The top record shows "${String(firstRow[labelKey])}"${
    primaryMetric ? ` with ${primaryMetric}: ${Number(firstRow[primaryMetric]).toLocaleString()}` : ''
  }. Query executed across authorized analytics views.`;

  return {
    answer,
    recommendations: [
      'Export or review individual rows for deeper drill-down.',
      'Combine with diagnostic filters to isolate key performance anomalies.',
    ],
    chart,
    confidence: 0.9,
  };
}
