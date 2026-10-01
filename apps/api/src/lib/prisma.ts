import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
import { logger } from './logger';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    datasources: {
      db: {
        url: env.NODE_ENV === 'test' ? env.TEST_DATABASE_URL : env.DATABASE_URL,
      },
    },
    log:
      env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ error }, 'Database health check failed');
    return false;
  }
}
