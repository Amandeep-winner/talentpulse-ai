import { Pool } from 'pg';
import { testPrisma, truncateAllTables } from './helpers/db';
import { toVectorLiteral, updateCandidateEmbedding, knnCandidates } from '../src/lib/vector';
import { env } from '../src/config/env';

describe('PostgreSQL, pgvector, Views, and Read-Only Role', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('performs vector insert and KNN search returning nearest candidate', async () => {
    // Create organization
    const org = await testPrisma.organization.create({
      data: { name: 'Vector Test Org' },
    });

    // Create 2 candidates
    const candidateA = await testPrisma.candidate.create({
      data: {
        organizationId: org.id,
        name: 'Alice DevOps',
        email: 'alice@vector.test',
        location: 'Bengaluru',
        experienceYears: 5,
        skills: ['Kubernetes', 'Docker'],
      },
    });

    const candidateB = await testPrisma.candidate.create({
      data: {
        organizationId: org.id,
        name: 'Bob Sales',
        email: 'bob@vector.test',
        location: 'Mumbai',
        experienceYears: 2,
        skills: ['CRM', 'Negotiation'],
      },
    });

    // Construct 384-dimensional unit vectors
    const vecA = new Array(384).fill(0);
    vecA[0] = 1.0;

    const vecB = new Array(384).fill(0);
    vecB[1] = 1.0;

    // Save vectors using helper
    await updateCandidateEmbedding(candidateA.id, vecA);
    await updateCandidateEmbedding(candidateB.id, vecB);

    // Query with vector very close to A
    const queryVec = new Array(384).fill(0);
    queryVec[0] = 0.99;
    queryVec[1] = 0.01;

    // Use testPrisma for raw SQL KNN in this test
    const rawResults = await testPrisma.$queryRawUnsafe<Array<{ id: string; name: string; similarity: number }>>(
      `SELECT id, name, (1 - (embedding <=> $1::vector)) AS similarity
       FROM "Candidate"
       WHERE "organizationId" = $2::uuid AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector ASC
       LIMIT 5`,
      toVectorLiteral(queryVec),
      org.id,
    );

    expect(rawResults.length).toBe(2);
    expect(rawResults[0]?.name).toBe('Alice DevOps');
    expect(Number(rawResults[0]?.similarity)).toBeGreaterThan(0.9);
    expect(Number(rawResults[0]?.similarity)).toBeGreaterThan(Number(rawResults[1]?.similarity));

    // Also verify knnCandidates helper function directly
    const knnHelperResults = await knnCandidates({
      orgId: org.id,
      queryVector: queryVec,
      limit: 5,
    });
    expect(knnHelperResults.length).toBe(2);
    expect(knnHelperResults[0]?.name).toBe('Alice DevOps');
  });

  it('verifies that analytics views exist and can be queried', async () => {
    const funnelRows = await testPrisma.$queryRaw`SELECT * FROM v_job_funnel_daily LIMIT 1`;
    const publisherRows = await testPrisma.$queryRaw`SELECT * FROM v_publisher_performance_daily LIMIT 1`;
    const campaignRows = await testPrisma.$queryRaw`SELECT * FROM v_campaign_summary LIMIT 1`;
    const applicationRows = await testPrisma.$queryRaw`SELECT * FROM v_applications_overview LIMIT 1`;
    const jobRows = await testPrisma.$queryRaw`SELECT * FROM v_jobs_overview LIMIT 1`;

    expect(Array.isArray(funnelRows)).toBe(true);
    expect(Array.isArray(publisherRows)).toBe(true);
    expect(Array.isArray(campaignRows)).toBe(true);
    expect(Array.isArray(applicationRows)).toBe(true);
    expect(Array.isArray(jobRows)).toBe(true);
  });

  it('enforces tp_readonly permissions: User table denied, v_job_funnel_daily allowed', async () => {
    // Read-only pool connecting to test DB with tp_readonly credentials
    const readOnlyUrl = env.DATABASE_READONLY_URL.replace('/talentpulse', '/talentpulse_test');
    const readOnlyPool = new Pool({
      connectionString: readOnlyUrl,
    });

    try {
      // 1. SELECT on "User" should fail with 42501 (insufficient privilege)
      let permissionDenied = false;
      try {
        await readOnlyPool.query('SELECT * FROM "User"');
      } catch (err: unknown) {
        permissionDenied = true;
        const pgErr = err as { code?: string; message?: string };
        expect(pgErr.message).toMatch(/permission denied/i);
      }
      expect(permissionDenied).toBe(true);

      // 2. SELECT on view should succeed
      const viewResult = await readOnlyPool.query('SELECT * FROM v_job_funnel_daily LIMIT 5');
      expect(Array.isArray(viewResult.rows)).toBe(true);
    } finally {
      await readOnlyPool.end();
    }
  });
});
