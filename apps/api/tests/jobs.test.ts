import request from 'supertest';
import { createApp } from '../src/app';
import { testPrisma, truncateAllTables } from './helpers/db';

const app = createApp();

describe('Jobs Module Integration Tests', () => {
  let adminToken: string;
  let recruiterToken: string;
  let analystToken: string;

  beforeEach(async () => {
    await truncateAllTables();

    // Register organization and ADMIN user
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'Jobs Test Corp',
        name: 'Admin User',
        email: 'admin@jobs.com',
        password: 'Password123!',
      });
    adminToken = regRes.body.data.accessToken;

    // Create RECRUITER
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Recruiter User',
        email: 'recruiter@jobs.com',
        password: 'Password123!',
        role: 'RECRUITER',
      });
    const recLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'recruiter@jobs.com', password: 'Password123!' });
    recruiterToken = recLogin.body.data.accessToken;

    // Create ANALYST
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Analyst User',
        email: 'analyst@jobs.com',
        password: 'Password123!',
        role: 'ANALYST',
      });
    const anLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'analyst@jobs.com', password: 'Password123!' });
    analystToken = anLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('creates, reads, updates, and deletes jobs with skill normalization', async () => {
    // 1. Create job with unnormalized skill aliases
    const createRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        title: 'Senior Fullstack Engineer',
        description: 'Lead backend and frontend architecture across distributed teams.',
        category: 'Engineering',
        location: 'Bengaluru',
        remote: true,
        employmentType: 'FULL_TIME',
        salaryMin: 2500000,
        salaryMax: 4000000,
        minExperienceYears: 5,
        requiredSkills: ['react.js', 'k8s', 'python3', 'React'],
        preferredSkills: ['postgres', 'AWS', 'amazon web services'],
      });

    expect(createRes.status).toBe(201);
    const job = createRes.body.data;
    expect(job.title).toBe('Senior Fullstack Engineer');
    // Check skill normalization and deduplication
    expect(job.requiredSkills).toEqual(['React', 'Kubernetes', 'Python']);
    expect(job.preferredSkills).toEqual(['PostgreSQL', 'AWS']);

    const jobId = job.id;

    // 2. Get Job by ID
    const getRes = await request(app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${analystToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(jobId);

    // 3. Patch Job
    const patchRes = await request(app)
      .patch(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        title: 'Lead Fullstack Engineer',
        requiredSkills: ['golang', 'go', 'TypeScript'],
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.title).toBe('Lead Fullstack Engineer');
    expect(patchRes.body.data.requiredSkills).toEqual(['Go', 'TypeScript']);

    // 4. Delete Job
    const deleteRes = await request(app)
      .delete(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    // 5. Verify 404 after deletion
    const verifyRes = await request(app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(verifyRes.status).toBe(404);
  });

  it('paginates, filters, and searches jobs with caching headers', async () => {
    // Create 3 jobs
    await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Backend Python Developer',
        description: 'Build fast APIs using FastAPI and PostgreSQL.',
        category: 'Engineering',
        location: 'Bengaluru',
        remote: true,
        minExperienceYears: 3,
        requiredSkills: ['Python', 'FastAPI'],
      });

    await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Product Marketing Manager',
        description: 'Drive GTM strategy and campaign launches.',
        category: 'Marketing',
        location: 'Mumbai',
        remote: false,
        minExperienceYears: 4,
        requiredSkills: ['GTM', 'SEO'],
      });

    // 1. List with pagination
    const listRes1 = await request(app)
      .get('/api/jobs?page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes1.status).toBe(200);
    expect(listRes1.body.data).toHaveLength(2);
    expect(listRes1.body.meta.total).toBe(2);
    expect(listRes1.headers['x-cache']).toBeDefined();

    // 2. Filter by category
    const filterRes = await request(app)
      .get('/api/jobs?category=Marketing')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(filterRes.status).toBe(200);
    expect(filterRes.body.data).toHaveLength(1);
    expect(filterRes.body.data[0].title).toBe('Product Marketing Manager');

    // 3. Search query q
    const searchRes = await request(app)
      .get('/api/jobs?q=FastAPI')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data).toHaveLength(1);
    expect(searchRes.body.data[0].title).toBe('Backend Python Developer');
  });

  it('enforces RBAC: ANALYST can read but cannot create, update, or delete', async () => {
    // ANALYST cannot create job (403)
    const createRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        title: 'Analyst Created Job',
        description: 'Testing rbac restrictions.',
        category: 'Engineering',
        location: 'Delhi',
        requiredSkills: ['Python'],
      });
    expect(createRes.status).toBe(403);
    expect(createRes.body.error.code).toBe('FORBIDDEN');

    // Admin creates job
    const adminJob = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Allowed Job',
        description: 'Testing read permissions.',
        category: 'Engineering',
        location: 'Delhi',
        requiredSkills: ['Python'],
      });
    const jobId = adminJob.body.data.id;

    // ANALYST can read (200)
    const readRes = await request(app)
      .get(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${analystToken}`);
    expect(readRes.status).toBe(200);

    // ANALYST cannot update (403)
    const patchRes = await request(app)
      .patch(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ title: 'Hacked Title' });
    expect(patchRes.status).toBe(403);

    // ANALYST cannot delete (403)
    const deleteRes = await request(app)
      .delete(`/api/jobs/${jobId}`)
      .set('Authorization', `Bearer ${analystToken}`);
    expect(deleteRes.status).toBe(403);
  });

  it('enforces multi-tenant cross-organization isolation for jobs', async () => {
    // Org 1 creates job
    const org1Job = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Org 1 Secret Job',
        description: 'Strictly confidential internal role.',
        category: 'Executive',
        location: 'Bengaluru',
        requiredSkills: ['Leadership'],
      });
    const org1JobId = org1Job.body.data.id;

    // Register Org 2
    const org2Res = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'Competitor Corp',
        name: 'Competitor Admin',
        email: 'admin@competitor.com',
        password: 'Password123!',
      });
    const org2Token = org2Res.body.data.accessToken;

    // Org 2 cannot read Org 1 job (404)
    const crossGet = await request(app)
      .get(`/api/jobs/${org1JobId}`)
      .set('Authorization', `Bearer ${org2Token}`);
    expect(crossGet.status).toBe(404);

    // Org 2 list does not show Org 1 jobs
    const org2List = await request(app)
      .get('/api/jobs')
      .set('Authorization', `Bearer ${org2Token}`);
    expect(org2List.body.data).toHaveLength(0);

    // Org 2 cannot delete Org 1 job
    const crossDelete = await request(app)
      .delete(`/api/jobs/${org1JobId}`)
      .set('Authorization', `Bearer ${org2Token}`);
    expect(crossDelete.status).toBe(404);
  });
});
