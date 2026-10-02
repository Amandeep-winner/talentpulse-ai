import { Parser } from 'node-sql-parser';
import { ALLOWED_VIEWS } from './schema';
import { SqlRejectedError } from '../../../lib/errors/AppError';

export interface ValidationSuccess {
  valid: true;
  sql: string;
  tables: string[];
}

export interface ValidationFailure {
  valid: false;
  error: string;
  code: 'SQL_REJECTED';
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

const FORBIDDEN_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'TRUNCATE',
  'CREATE',
  'GRANT',
  'REVOKE',
  'COPY',
  'CALL',
  'DO',
  'EXECUTE',
  'SET',
  'RESET',
  'VACUUM',
];

const FORBIDDEN_FUNCTIONS = [
  'pg_sleep',
  'pg_read_file',
  'lo_import',
  'dblink',
  'set_config',
  'current_setting',
];

const MAX_SQL_LENGTH = 2000;
const MAX_ALLOWED_LIMIT = 500;
const DEFAULT_INJECTED_LIMIT = 100;

const parser = new Parser();

/**
 * Validates a SQL query against strict AST and safety guardrails.
 *
 * Rules:
 * 1. Exactly one statement; must parse cleanly; type must be SELECT (including SELECT CTEs).
 * 2. Reject DML, DDL, administrative commands, forbidden functions, comments, and semicolon chaining.
 * 3. Every referenced table must be in the allowlist of views (or a defined CTE).
 * 4. Force a LIMIT clause (inject LIMIT 100 if missing, cap to <= 500 if larger).
 * 5. Maximum query length <= 2000 characters.
 */
export function validateSql(rawSql: string): ValidationResult {
  const trimmed = rawSql.trim();

  // 1. Length check
  if (trimmed.length === 0) {
    return {
      valid: false,
      error: 'SQL query cannot be empty.',
      code: 'SQL_REJECTED',
    };
  }

  if (trimmed.length > MAX_SQL_LENGTH) {
    return {
      valid: false,
      error: `SQL query exceeds maximum allowed length of ${MAX_SQL_LENGTH} characters.`,
      code: 'SQL_REJECTED',
    };
  }

  // 2. Comments check (reject inline -- and multiline /* */)
  if (trimmed.includes('--') || /\/\*[\s\S]*?\*\//.test(trimmed)) {
    return {
      valid: false,
      error: "SQL comments ('--' or '/* */') are strictly forbidden.",
      code: 'SQL_REJECTED',
    };
  }

  // 3. Semicolon chaining check
  // Strip a single trailing semicolon if present
  const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, '');
  if (withoutTrailingSemicolon.includes(';')) {
    return {
      valid: false,
      error: 'Multiple SQL statements or semicolon chaining are strictly forbidden.',
      code: 'SQL_REJECTED',
    };
  }

  // 4. Forbidden keyword check (word-boundary case-insensitive regex)
  for (const kw of FORBIDDEN_KEYWORDS) {
    const regex = new RegExp(`\\b${kw}\\b`, 'i');
    if (regex.test(withoutTrailingSemicolon)) {
      return {
        valid: false,
        error: `Statement type or keyword '${kw}' is strictly forbidden. Only read-only SELECT queries are allowed.`,
        code: 'SQL_REJECTED',
      };
    }
  }

  // 5. Forbidden functions check
  for (const fn of FORBIDDEN_FUNCTIONS) {
    const regex = new RegExp(`\\b${fn}\\b\\s*\\(`, 'i');
    if (regex.test(withoutTrailingSemicolon)) {
      return {
        valid: false,
        error: `Database function '${fn}' is strictly forbidden.`,
        code: 'SQL_REJECTED',
      };
    }
  }

interface AstLimitValue {
  type: string;
  value: number;
}

interface AstCte {
  name?: string | { value?: string };
  stmt?: { ast?: { type?: string } };
}

interface AstNode {
  type?: string;
  with?: AstCte[];
  limit?: {
    seperator?: string;
    value?: AstLimitValue[];
  };
}

  // 6. AST Parsing using node-sql-parser (PostgreSQL dialect)
  let rawParsed: unknown;
  try {
    rawParsed = parser.astify(withoutTrailingSemicolon, { database: 'postgresql' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid SQL';
    return {
      valid: false,
      error: `SQL syntax parsing error: ${message}`,
      code: 'SQL_REJECTED',
    };
  }

  // Ensure single statement
  let ast: AstNode;
  if (Array.isArray(rawParsed)) {
    if (rawParsed.length !== 1) {
      return {
        valid: false,
        error: 'Only exactly one statement may be executed at a time.',
        code: 'SQL_REJECTED',
      };
    }
    ast = rawParsed[0] as AstNode;
  } else {
    ast = rawParsed as AstNode;
  }

  // Must be a SELECT statement
  if (!ast || ast.type !== 'select') {
    return {
      valid: false,
      error: `Invalid query type '${ast?.type || 'unknown'}'. Only SELECT queries are permitted.`,
      code: 'SQL_REJECTED',
    };
  }

  // Collect CTE names if present
  const cteNames = new Set<string>();
  if (ast.with && Array.isArray(ast.with)) {
    for (const cte of ast.with) {
      const cteName = typeof cte.name === 'string' ? cte.name : cte.name?.value;
      if (cteName) {
        cteNames.add(cteName.toLowerCase());
      }
      // Ensure each CTE statement is a SELECT
      if (cte.stmt && cte.stmt.ast && cte.stmt.ast.type !== 'select') {
        return {
          valid: false,
          error: `Common Table Expression (CTE) '${cteName}' must be a SELECT query.`,
          code: 'SQL_REJECTED',
        };
      }
    }
  }

  // 7. Table Allowlist Check
  let tableEntries: string[];
  try {
    tableEntries = parser.tableList(withoutTrailingSemicolon, { database: 'postgresql' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown table parsing error';
    return {
      valid: false,
      error: `Failed to extract table list from query: ${message}`,
      code: 'SQL_REJECTED',
    };
  }

  const allowedViewsLower = ALLOWED_VIEWS.map((v) => v.toLowerCase());
  const extractedTables: string[] = [];

  for (const entry of tableEntries) {
    // entry format: action::database::table
    const parts = entry.split('::');
    const dbOrSchema = parts[1];
    const tableName = parts[2];

    if (!tableName) continue;

    const lowerTable = tableName.replace(/^"|"$/g, '').toLowerCase();

    // Reject schema-qualified names (e.g. public.xyz, pg_catalog.xyz)
    if (dbOrSchema && dbOrSchema !== 'null') {
      return {
        valid: false,
        error: `Schema-qualified table names are forbidden ('${dbOrSchema}.${tableName}'). Please query view names directly.`,
        code: 'SQL_REJECTED',
      };
    }

    // Reject pg_ or information_schema catalog references
    if (lowerTable.startsWith('pg_') || lowerTable.startsWith('information_schema')) {
      return {
        valid: false,
        error: `Access to system catalog '${tableName}' is forbidden.`,
        code: 'SQL_REJECTED',
      };
    }

    // Allow if it is a defined CTE
    if (cteNames.has(lowerTable)) {
      continue;
    }

    // Must be in ALLOWED_VIEWS
    if (!allowedViewsLower.includes(lowerTable)) {
      return {
        valid: false,
        error: `Table or view '${tableName}' is not permitted. Only the following analytics views are accessible: ${ALLOWED_VIEWS.join(', ')}.`,
        code: 'SQL_REJECTED',
      };
    }

    if (!extractedTables.includes(lowerTable)) {
      extractedTables.push(lowerTable);
    }
  }

  // 8. Limit Enforcement
  if (!ast.limit || !ast.limit.value || ast.limit.value.length === 0) {
    // Inject default LIMIT
    ast.limit = {
      seperator: '',
      value: [{ type: 'number', value: DEFAULT_INJECTED_LIMIT }],
    };
  } else {
    // If limit exceeds MAX_ALLOWED_LIMIT, clamp it
    const firstLimit = ast.limit.value[0];
    if (firstLimit && Number.isFinite(firstLimit.value) && firstLimit.value > MAX_ALLOWED_LIMIT) {
      firstLimit.value = MAX_ALLOWED_LIMIT;
    }
  }

  // Re-generate normalized SQL from sanitized AST
  let validatedSql: string;
  try {
    const nodeAst = ast as unknown as Parameters<typeof parser.sqlify>[0];
    validatedSql = parser.sqlify(nodeAst, { database: 'postgresql' });
  } catch (_err: unknown) {
    // Fallback if sqlify has edge case with custom syntax: append limit manually if not present
    if (!/LIMIT\s+\d+/i.test(withoutTrailingSemicolon)) {
      validatedSql = `${withoutTrailingSemicolon} LIMIT ${DEFAULT_INJECTED_LIMIT}`;
    } else {
      validatedSql = withoutTrailingSemicolon;
    }
  }

  return {
    valid: true,
    sql: validatedSql,
    tables: extractedTables,
  };
}

/**
 * Asserts that a SQL query is valid according to our safety rules,
 * throwing SqlRejectedError if it fails.
 */
export function assertValidSql(rawSql: string): ValidationSuccess {
  const result = validateSql(rawSql);
  if (!result.valid) {
    throw new SqlRejectedError(result.error);
  }
  return result;
}
