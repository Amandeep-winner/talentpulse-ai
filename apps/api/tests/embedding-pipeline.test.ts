import request from 'supertest';
import { createApp } from '../src/app';
import { testPrisma, truncateAllTables } from './helpers/db';
import { embeddingService } from '../src/modules/embeddings/embedding.service';

const app = createApp();

describe('Embedding Pipeline Integration Tests', () => {
  let adminToken: string;
  let recruiterToken: string;
  let analystToken: string;
  let orgId: string;

  beforeEach(async () => {
    await truncateAllTables();

    // Register organization and ADMIN user
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'Pipeline Test Corp',
        name: 'Admin User',
        email: 'admin@pipeline.com',
        password: 'Password123!',
      });
    adminToken = regRes.body.data.accessToken;

    // Fetch org ID
    const org = await testPrisma.organization.findFirst();
    orgId = org!.id;

    // Create RECRUITER
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Recruiter User',
        email: 'recruiter@pipeline.com',
        password: 'Password123!',
        role: 'RECRUITER',
      });
    const recLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'recruiter@pipeline.com', password: 'Password123!' });
    recruiterToken = recLogin.body.data.accessToken;

    // Create ANALYST
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Analyst User',
        email: 'analyst@pipeline.com',
        password: 'Password123!',
        role: 'ANALYST',
      });
    const anLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'analyst@pipeline.com', password: 'Password123!' });
    analystToken = anLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('embedJob creates job embedding vector and updates embeddedAt timestamp', async () => {
    const job = await testPrisma.job.create({
      data: {
        organizationId: orgId,
        title: 'Principal Backend Architect',
        description: 'Lead high-scale distributed systems and cloud infrastructure across Kubernetes clusters.',
        category: 'engineering',
        location: 'Bengaluru',
        remote: true,
        requiredSkills: ['kubernetes', 'go', 'postgresql', 'redis'],
        preferredSkills: ['kafka', 'terraform'],
        minExperienceYears: 8,
      },
    });

    const result = await embeddingService.embedJob(job.id, orgId);
    expect(result.dimension).toBe(384);

    const updatedJob = await testPrisma.job.findUnique({
      where: { id: job.id },
    });
    expect(updatedJob!.embeddedAt).not.toBeNull();

    // Verify embedding vector exists in Postgres via raw query
    const rows = await testPrisma.$queryRaw<Array<{ has_vec: boolean; dim: number }>>`
      SELECT (embedding IS NOT NULL) AS has_vec, vector_dims(embedding) AS dim
      FROM "Job" WHERE id = ${job.id}::uuid
    `;
    expect(rows[0]!.has_vec).toBe(true);
    expect(Number(rows[0]!.dim)).toBe(384);
  });

  it('embedCandidate chunks resume, inserts CandidateChunk records, and sets mean candidate vector', async () => {
    const candidate = await testPrisma.candidate.create({
      data: {
        organizationId: orgId,
        name: 'Priya Sharma',
        email: 'priya.sharma@example.com',
        location: 'Hyderabad',
        experienceYears: 6.5,
        skills: ['react', 'typescript', 'nextjs', 'tailwind', 'graphql'],
        education: 'B.Tech in Computer Science',
        resumeText: `Professional Profile for Priya Sharma:
Senior Frontend Engineer with 6.5 years building responsive web applications.
Experienced with modern state management, design systems, and web performance optimization.
Led the migration from legacy monolithic views to modern React server components.
Passionate about engineering excellence, test automation, and accessible user interfaces.`,
      },
    });

    const result = await embeddingService.embedCandidate(candidate.id, orgId);
    expect(result.dimension).toBe(384);
    expect(result.chunkCount).toBeGreaterThanOrEqual(1);

    // Verify candidate-level embedding in Postgres
    const candidateRows = await testPrisma.$queryRaw<Array<{ has_vec: boolean; dim: number }>>`
      SELECT (embedding IS NOT NULL) AS has_vec, vector_dims(embedding) AS dim
      FROM "Candidate" WHERE id = ${candidate.id}::uuid
    `;
    expect(candidateRows[0]!.has_vec).toBe(true);
    expect(Number(candidateRows[0]!.dim)).toBe(384);

    // Verify CandidateChunk table rows
    const chunkRows = await testPrisma.$queryRaw<Array<{ count: bigint; dim: number }>>`
      SELECT COUNT(*) as count, MAX(vector_dims(embedding)) as dim
      FROM "CandidateChunk" WHERE "candidateId" = ${candidate.id}::uuid
    `;
    expect(Number(chunkRows[0]!.count)).toBe(result.chunkCount);
    expect(Number(chunkRows[0]!.dim)).toBe(384);
  });

  it('idempotently re-embeds a candidate without duplicating chunk records', async () => {
    const candidate = await testPrisma.candidate.create({
      data: {
        organizationId: orgId,
        name: 'Vikram Malhotra',
        email: 'vikram.m@example.com',
        location: 'Pune',
        skills: ['docker', 'kubernetes', 'aws'],
        resumeText: 'DevOps engineer with 5 years experience managing multi-region cloud infrastructure.',
      },
    });

    // First embed
    const firstRes = await embeddingService.embedCandidate(candidate.id, orgId);
    const count1 = await testPrisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "CandidateChunk" WHERE "candidateId" = ${candidate.id}::uuid
    `;
    expect(Number(count1[0]!.count)).toBe(firstRes.chunkCount);

    // Second embed (simulate update/re-index)
    const secondRes = await embeddingService.embedCandidate(candidate.id, orgId);
    const count2 = await testPrisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "CandidateChunk" WHERE "candidateId" = ${candidate.id}::uuid
    `;
    expect(Number(count2[0]!.count)).toBe(secondRes.chunkCount);
  });

  describe('HTTP Endpoints', () => {
    it('POST /api/jobs/:id/embed triggers embedding for job', async () => {
      const job = await testPrisma.job.create({
        data: {
          organizationId: orgId,
          title: 'Data Platform Engineer',
          description: 'Build robust ETL data pipelines with Spark and Snowflake.',
          category: 'data',
          location: 'Remote',
          requiredSkills: ['spark', 'python', 'sql'],
        },
      });

      const res = await request(app)
        .post(`/api/jobs/${job.id}/embed`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.dimension).toBe(384);
      expect(res.body.data.message).toBe('Job embedded successfully');

      // Unauthorized check
      const unauth = await request(app)
        .post(`/api/jobs/${job.id}/embed`)
        .set('Authorization', `Bearer ${analystToken}`);
      expect(unauth.status).toBe(403);
    });

    it('POST /api/candidates/:id/embed triggers embedding for candidate', async () => {
      const candidate = await testPrisma.candidate.create({
        data: {
          organizationId: orgId,
          name: 'Ananya Roy',
          email: 'ananya.roy@example.com',
          location: 'Delhi NCR',
          skills: ['figma', 'ux research', 'wireframing'],
          resumeText: 'Lead Product Designer with 4 years creating design systems and user journey maps.',
        },
      });

      const res = await request(app)
        .post(`/api/candidates/${candidate.id}/embed`)
        .set('Authorization', `Bearer ${recruiterToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.dimension).toBe(384);
      expect(res.body.data.chunkCount).toBeGreaterThanOrEqual(1);

      // Analyst forbidden
      const forbidden = await request(app)
        .post(`/api/candidates/${candidate.id}/embed`)
        .set('Authorization', `Bearer ${analystToken}`);
      expect(forbidden.status).toBe(403);
    });

    it('POST /api/admin/reindex is restricted to ADMIN and reindexes organization', async () => {
      // Create sample job and candidate
      await testPrisma.job.create({
        data: {
          organizationId: orgId,
          title: 'QA Automation Engineer',
          description: 'Develop end-to-end Cypress and Playwright test automation suites.',
          category: 'engineering',
          location: 'Chennai',
          requiredSkills: ['cypress', 'typescript', 'playwright'],
        },
      });

      await testPrisma.candidate.create({
        data: {
          organizationId: orgId,
          name: 'Deepak Verma',
          email: 'deepak.v@example.com',
          location: 'Mumbai',
          skills: ['salesforce', 'crm', 'b2b sales'],
          resumeText: 'Enterprise Account Executive with 7 years managing large commercial pipelines.',
        },
      });

      // Recruiter forbidden
      const recRes = await request(app)
        .post('/api/admin/reindex')
        .set('Authorization', `Bearer ${recruiterToken}`);
      expect(recRes.status).toBe(403);

      // Admin allowed
      const adminRes = await request(app)
        .post('/api/admin/reindex')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(adminRes.status).toBe(200);
      expect(adminRes.body.data.jobsCount).toBeGreaterThanOrEqual(1);
      expect(adminRes.body.data.candidatesCount).toBeGreaterThanOrEqual(1);
    });

    it('enforces tenant isolation: cannot embed candidate belonging to another org', async () => {
      // Create another org and candidate
      const otherOrg = await testPrisma.organization.create({
        data: { name: 'Foreign Org' },
      });
      const otherCand = await testPrisma.candidate.create({
        data: {
          organizationId: otherOrg.id,
          name: 'Foreign Candidate',
          email: 'foreign@other.com',
          location: 'Remote',
          skills: ['java'],
          resumeText: 'Java developer at external organization.',
        },
      });

      const res = await request(app)
        .post(`/api/candidates/${otherCand.id}/embed`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });
});
