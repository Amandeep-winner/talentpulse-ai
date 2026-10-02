import { Pool, PoolClient } from 'pg';
import { env } from '../../../config/env';
import { logger } from '../../../lib/logger';
import { SqlRejectedError } from '../../../lib/errors/AppError';

export interface SqlExecutionResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
  fields: string[];
  executionTimeMs: number;
}

let poolInstance: Pool | null = null;

function getReadOnlyPool(): Pool {
  if (!poolInstance) {
    let connectionString = env.DATABASE_READONLY_URL;

    // In test environment, target talentpulse_test DB with the readonly credentials
    if (env.NODE_ENV === 'test') {
      try {
        const url = new URL(connectionString);
        url.pathname = '/talentpulse_test';
        connectionString = url.toString();
      } catch {
        connectionString = connectionString.replace(/\/[^/?]+(\?.*)?$/, '/talentpulse_test$1');
      }
    }

    poolInstance = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    poolInstance.on('error', (err) => {
      logger.error({ err }, 'Unexpected error on idle readonly postgres client');
    });
  }

  return poolInstance;
}

/**
 * Executes a validated SQL query against PostgreSQL with:
 * 1. Dedicated read-only role (tp_readonly)
 * 2. Session-level statement_timeout (default 5000ms)
 * 3. Scoped tenant isolation GUC: SELECT set_config('app.org_id', $1, true)
 */
export async function executeReadOnlySql(
  organizationId: string,
  sql: string,
  timeoutMs = 5000
): Promise<SqlExecutionResult> {
  const pool = getReadOnlyPool();
  let client: PoolClient | null = null;
  const startTime = Date.now();

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = '${timeoutMs}'`);
    await client.query("SELECT set_config('app.org_id', $1, true)", [organizationId]);

    const res = await client.query(sql);
    await client.query('COMMIT');

    const executionTimeMs = Date.now() - startTime;

    return {
      rows: res.rows,
      rowCount: res.rowCount ?? res.rows.length,
      fields: res.fields.map((f) => f.name),
      executionTimeMs,
    };
  } catch (err: unknown) {
    if (client) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
    }

    const executionTimeMs = Date.now() - startTime;
    const pgErr = err as { code?: string; message?: string };

    // Handle postgres query cancellation / statement timeout (code 57014)
    if (pgErr.code === '57014') {
      logger.warn({ timeoutMs, executionTimeMs, sql }, 'Text-to-SQL query statement timeout exceeded');
      throw new SqlRejectedError(
        `Query exceeded maximum allowed execution time of ${timeoutMs}ms (statement timeout).`
      );
    }

    // Permission denied on table
    if (pgErr.code === '42501') {
      logger.warn({ err: pgErr.message, sql }, 'Permission denied on database object for read-only role');
      throw new SqlRejectedError(
        'Database access denied: Insufficient permissions for requested table or view.'
      );
    }

    logger.error({ err, sql }, 'Failed to execute read-only text-to-SQL query');
    throw err;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Gracefully close the readonly connection pool (used during process termination or test teardown).
 */
export async function closeReadOnlyPool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
  }
}
