import { PrismaClient } from '@prisma/client';
import { env } from '../../src/config/env';

export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: env.TEST_DATABASE_URL,
    },
  },
  log: ['error'],
});

export async function truncateAllTables(): Promise<void> {
  const tablenames = await testPrisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname='public'
      AND tablename NOT LIKE '_prisma_%';
  `;

  if (tablenames.length === 0) return;

  const tables = tablenames
    .map(({ tablename }) => `"${tablename}"`)
    .join(', ');

  await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE;`);
}
