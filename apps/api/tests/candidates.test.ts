import request from 'supertest';
import { createApp } from '../src/app';
import { testPrisma, truncateAllTables } from './helpers/db';

const app = createApp();

describe('Candidates Module Integration Tests', () => {
  let adminToken: string;
  let recruiterToken: string;
  let analystToken: string;

  beforeEach(async () => {
    await truncateAllTables();

    // Register organization and ADMIN user
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'Candidates Test Corp',
        name: 'Admin User',
        email: 'admin@candidates.com',
        password: 'Password123!',
      });
    adminToken = regRes.body.data.accessToken;

    // Create RECRUITER
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Recruiter User',
        email: 'recruiter@candidates.com',
        password: 'Password123!',
        role: 'RECRUITER',
      });
    const recLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'recruiter@candidates.com', password: 'Password123!' });
    recruiterToken = recLogin.body.data.accessToken;

    // Create ANALYST
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Analyst User',
        email: 'analyst@candidates.com',
        password: 'Password123!',
        role: 'ANALYST',
      });
    const anLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'analyst@candidates.com', password: 'Password123!' });
    analystToken = anLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it('creates, reads, updates, and deletes candidates with skill normalization', async () => {
    // 1. Create candidate
    const createRes = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        name: 'Rohan Sharma',
        email: 'rohan.sharma@example.com',
        location: 'Bengaluru',
        remoteOk: true,
        experienceYears: 6.5,
        skills: ['react.js', 'react', 'k8s', 'python', 'PYTHON3'],
        education: 'B.Tech in Computer Science',
        expectedSalary: 3200000,
      });

    expect(createRes.status).toBe(201);
    const candidate = createRes.body.data;
    expect(candidate.name).toBe('Rohan Sharma');
    expect(candidate.email).toBe('rohan.sharma@example.com');
    expect(candidate.skills).toEqual(['React', 'Kubernetes', 'Python']);

    const candidateId = candidate.id;

    // 2. Read Candidate
    const getRes = await request(app)
      .get(`/api/candidates/${candidateId}`)
      .set('Authorization', `Bearer ${analystToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.id).toBe(candidateId);

    // 3. Patch Candidate
    const patchRes = await request(app)
      .patch(`/api/candidates/${candidateId}`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        location: 'Hyderabad',
        skills: ['docker', 'TypeScript'],
      });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.location).toBe('Hyderabad');
    expect(patchRes.body.data.skills).toEqual(['Docker', 'TypeScript']);

    // 4. Delete Candidate
    const deleteRes = await request(app)
      .delete(`/api/candidates/${candidateId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    // 5. Verify 404
    const verifyRes = await request(app)
      .get(`/api/candidates/${candidateId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(verifyRes.status).toBe(404);
  });

  it('handles resume upload via plain text and pasted text', async () => {
    // Create candidate
    const createRes = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        name: 'Priya Patel',
        email: 'priya.patel@example.com',
        location: 'Pune',
        skills: ['Java', 'Spring Boot'],
      });
    const candidateId = createRes.body.data.id;

    // 1. Upload .txt file
    const txtContent = 'Experienced Java engineer with 4 years designing distributed microservices.';
    const uploadRes = await request(app)
      .post(`/api/candidates/${candidateId}/resume`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .attach('resume', Buffer.from(txtContent, 'utf-8'), 'resume.txt');

    expect(uploadRes.status).toBe(200);
    expect(uploadRes.body.data.resumeText).toContain('Experienced Java engineer');

    // 2. Upload pasted text
    const pastedText = 'Updated resume profile: Senior Backend Architect proficient in AWS and Kafka.';
    const pasteRes = await request(app)
      .post(`/api/candidates/${candidateId}/resume`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({ resumeText: pastedText });

    expect(pasteRes.status).toBe(200);
    expect(pasteRes.body.data.resumeText).toContain('Senior Backend Architect');
  });

  it('rejects unsupported resume file types with 400 validation error', async () => {
    const createRes = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        name: 'Amit Verma',
        email: 'amit.verma@example.com',
        location: 'Delhi',
        skills: ['SQL'],
      });
    const candidateId = createRes.body.data.id;

    // Attach invalid PNG image file
    const invalidUpload = await request(app)
      .post(`/api/candidates/${candidateId}/resume`)
      .set('Authorization', `Bearer ${recruiterToken}`)
      .attach('resume', Buffer.from('fake image binary content'), 'avatar.png');

    expect(invalidUpload.status).toBe(400);
    expect(invalidUpload.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('enforces RBAC: ANALYST cannot create or upload resume for candidates', async () => {
    const createRes = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${analystToken}`)
      .send({
        name: 'Denied Candidate',
        email: 'denied@example.com',
        location: 'Delhi',
      });
    expect(createRes.status).toBe(403);

    // Create candidate as Admin
    const adminCand = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Analyst Read Candidate',
        email: 'read@example.com',
        location: 'Delhi',
      });
    const candidateId = adminCand.body.data.id;

    // Analyst can read
    const readRes = await request(app)
      .get(`/api/candidates/${candidateId}`)
      .set('Authorization', `Bearer ${analystToken}`);
    expect(readRes.status).toBe(200);

    // Analyst cannot upload resume
    const uploadRes = await request(app)
      .post(`/api/candidates/${candidateId}/resume`)
      .set('Authorization', `Bearer ${analystToken}`)
      .send({ resumeText: 'Attempting analyst upload' });
    expect(uploadRes.status).toBe(403);
  });

  it('enforces multi-tenant cross-organization isolation for candidates', async () => {
    // Org 1 creates candidate
    const org1Cand = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Org 1 Private Candidate',
        email: 'private@org1.com',
        location: 'Chennai',
      });
    const candidateId = org1Cand.body.data.id;

    // Register Org 2
    const org2Res = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'Competitor Candidates Corp',
        name: 'Competitor Admin',
        email: 'admin@competitor-cand.com',
        password: 'Password123!',
      });
    const org2Token = org2Res.body.data.accessToken;

    // Org 2 cannot read Org 1 candidate (404)
    const crossGet = await request(app)
      .get(`/api/candidates/${candidateId}`)
      .set('Authorization', `Bearer ${org2Token}`);
    expect(crossGet.status).toBe(404);

    // Org 2 cannot upload resume for Org 1 candidate
    const crossUpload = await request(app)
      .post(`/api/candidates/${candidateId}/resume`)
      .set('Authorization', `Bearer ${org2Token}`)
      .send({ resumeText: 'Cross org attack' });
    expect(crossUpload.status).toBe(404);
  });
});
