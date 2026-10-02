import request from 'supertest';
import { createApp } from '../src/app';
import { testPrisma, truncateAllTables } from './helpers/db';
import { embeddingService } from '../src/modules/embeddings/embedding.service';

const app = createApp();

describe('Candidate Semantic Search (Vector Search)', () => {
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
        organizationName: 'Vector Search Corp',
        name: 'Admin User',
        email: 'admin@search.com',
        password: 'Password123!',
      });
    adminToken = regRes.body.data.accessToken;

    const org = await testPrisma.organization.findFirst();
    orgId = org!.id;

    // Create RECRUITER
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Recruiter User',
        email: 'recruiter@search.com',
        password: 'Password123!',
        role: 'RECRUITER',
      });
    const recLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'recruiter@search.com', password: 'Password123!' });
    recruiterToken = recLogin.body.data.accessToken;

    // Create ANALYST
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Analyst User',
        email: 'analyst@search.com',
        password: 'Password123!',
        role: 'ANALYST',
      });
    const anLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'analyst@search.com', password: 'Password123!' });
    analystToken = anLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('rejects empty or whitespace-only search query with 400', async () => {
    const resNoQuery = await request(app)
      .get('/api/candidates/search')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resNoQuery.status).toBe(400);

    const resEmptyQuery = await request(app)
      .get('/api/candidates/search?q=   ')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(resEmptyQuery.status).toBe(400);
  });

  it('ranks semantically relevant candidates at the top with similarity scores', async () => {
    // Create DevOps candidate
    const devOpsCand = await testPrisma.candidate.create({
      data: {
        organizationId: orgId,
        name: 'Rohan Sharma',
        email: 'rohan.devops@example.com',
        location: 'Bengaluru',
        experienceYears: 7,
        skills: ['kubernetes', 'docker', 'terraform', 'aws', 'ci/cd'],
        remoteOk: true,
        resumeText: 'Experienced Senior DevOps Engineer specialized in Kubernetes cluster operations, Docker containerization, and AWS Terraform automation.',
      },
    });
    await embeddingService.embedCandidate(devOpsCand.id, orgId);

    // Create Nurse candidate (unrelated)
    const nurseCand = await testPrisma.candidate.create({
      data: {
        organizationId: orgId,
        name: 'Sunita Nair',
        email: 'sunita.nurse@example.com',
        location: 'Mumbai',
        experienceYears: 8,
        skills: ['nursing', 'patient care', 'critical care', 'bls'],
        remoteOk: false,
        resumeText: 'Registered Staff Nurse with expertise in critical care, ICU patient monitoring, and hospital healthcare protocols.',
      },
    });
    await embeddingService.embedCandidate(nurseCand.id, orgId);

    // Create Frontend candidate
    const frontendCand = await testPrisma.candidate.create({
      data: {
        organizationId: orgId,
        name: 'Aditya Mehta',
        email: 'aditya.ui@example.com',
        location: 'Hyderabad',
        experienceYears: 4,
        skills: ['react', 'typescript', 'css', 'nextjs'],
        remoteOk: true,
        resumeText: 'Frontend developer building modern single-page applications with React, Next.js, and TypeScript design systems.',
      },
    });
    await embeddingService.embedCandidate(frontendCand.id, orgId);

    // Search for "kubernetes devops engineer"
    const res = await request(app)
      .get('/api/candidates/search?q=kubernetes+devops+engineer')
      .set('Authorization', `Bearer ${recruiterToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.candidates.length).toBe(3);

    const candidates = res.body.data.candidates;
    // Top candidate must be the DevOps candidate
    expect(candidates[0].id).toBe(devOpsCand.id);
    expect(candidates[0].name).toBe('Rohan Sharma');
    expect(candidates[0].similarity).toBeGreaterThan(candidates[1].similarity);
    expect(candidates[0].similarity).toBeGreaterThan(0.2);

    // Nurse candidate should have lowest similarity
    expect(candidates[2].id).toBe(nurseCand.id);
  });

  it('supports filters for remoteOk and minExperience', async () => {
    // Candidate 1: 3 years, remoteOk = true
    const cand1 = await testPrisma.candidate.create({
      data: {
        organizationId: orgId,
        name: 'Junior Cloud Eng',
        email: 'c1@example.com',
        location: 'Pune',
        experienceYears: 3,
        skills: ['python', 'aws'],
        remoteOk: true,
        resumeText: 'Python developer with AWS experience.',
      },
    });
    await embeddingService.embedCandidate(cand1.id, orgId);

    // Candidate 2: 9 years, remoteOk = false
    const cand2 = await testPrisma.candidate.create({
      data: {
        organizationId: orgId,
        name: 'Senior Onsite Architect',
        email: 'c2@example.com',
        location: 'Chennai',
        experienceYears: 9,
        skills: ['python', 'aws', 'architecture'],
        remoteOk: false,
        resumeText: 'Senior software architect with extensive Python and AWS backend expertise.',
      },
    });
    await embeddingService.embedCandidate(cand2.id, orgId);

    // Candidate 3: 10 years, remoteOk = true
    const cand3 = await testPrisma.candidate.create({
      data: {
        organizationId: orgId,
        name: 'Senior Remote Lead',
        email: 'c3@example.com',
        location: 'Bengaluru',
        experienceYears: 10,
        skills: ['python', 'aws', 'microservices'],
        remoteOk: true,
        resumeText: 'Principal backend engineer with Python, AWS, and distributed microservices experience.',
      },
    });
    await embeddingService.embedCandidate(cand3.id, orgId);

    // Filter by minExperience=5
    const resExp = await request(app)
      .get('/api/candidates/search?q=python+aws&minExperience=5')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resExp.status).toBe(200);
    expect(resExp.body.data.candidates.length).toBe(2);
    expect(resExp.body.data.candidates.every((c: { experienceYears: number }) => c.experienceYears >= 5)).toBe(true);

    // Filter by remoteOk=true AND minExperience=5
    const resBoth = await request(app)
      .get('/api/candidates/search?q=python+aws&minExperience=5&remoteOk=true')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resBoth.status).toBe(200);
    expect(resBoth.body.data.candidates.length).toBe(1);
    expect(resBoth.body.data.candidates[0].id).toBe(cand3.id);
  });

  it('strictly enforces multi-tenant isolation', async () => {
    // Create candidate in Org A
    const candA = await testPrisma.candidate.create({
      data: {
        organizationId: orgId,
        name: 'Org A Candidate',
        email: 'orga@example.com',
        location: 'Bengaluru',
        experienceYears: 5,
        skills: ['golang', 'distributed systems'],
        resumeText: 'Golang distributed systems engineer at Org A.',
      },
    });
    await embeddingService.embedCandidate(candA.id, orgId);

    // Register second organization
    const orgBRes = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'External Tenant Corp',
        name: 'Org B Admin',
        email: 'admin@orgb.com',
        password: 'Password123!',
      });
    const orgBToken = orgBRes.body.data.accessToken;

    const orgB = await testPrisma.organization.findFirst({
      where: { name: 'External Tenant Corp' },
    });

    const candB = await testPrisma.candidate.create({
      data: {
        organizationId: orgB!.id,
        name: 'Org B Candidate',
        email: 'orgb@example.com',
        location: 'Hyderabad',
        experienceYears: 5,
        skills: ['golang', 'distributed systems'],
        resumeText: 'Golang distributed systems engineer at Org B.',
      },
    });
    await embeddingService.embedCandidate(candB.id, orgB!.id);

    // Search from Org A should only return candA
    const resA = await request(app)
      .get('/api/candidates/search?q=golang')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(resA.status).toBe(200);
    expect(resA.body.data.candidates.length).toBe(1);
    expect(resA.body.data.candidates[0].id).toBe(candA.id);

    // Search from Org B should only return candB
    const resB = await request(app)
      .get('/api/candidates/search?q=golang')
      .set('Authorization', `Bearer ${orgBToken}`);

    expect(resB.status).toBe(200);
    expect(resB.body.data.candidates.length).toBe(1);
    expect(resB.body.data.candidates[0].id).toBe(candB.id);
  });

  it('allows ANALYST role to perform semantic search read-only', async () => {
    const res = await request(app)
      .get('/api/candidates/search?q=analytics+data')
      .set('Authorization', `Bearer ${analystToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.candidates).toBeDefined();
  });

  it('caches search results with 60s TTL and returns X-Cache header', async () => {
    const cand = await testPrisma.candidate.create({
      data: {
        organizationId: orgId,
        name: 'Cache Test Candidate',
        email: 'cache@example.com',
        location: 'Delhi',
        experienceYears: 4,
        skills: ['machine learning'],
        resumeText: 'Machine learning data scientist.',
      },
    });
    await embeddingService.embedCandidate(cand.id, orgId);

    // First request: MISS
    const res1 = await request(app)
      .get('/api/candidates/search?q=machine+learning')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res1.status).toBe(200);

    // Second request: HIT
    const res2 = await request(app)
      .get('/api/candidates/search?q=machine+learning')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res2.status).toBe(200);
    expect(res2.header['x-cache']).toBe('HIT');
  });
});
