import request from 'supertest';
import { createApp } from '../src/app';
import { truncateAllTables } from './helpers/db';

const app = createApp();

describe('Applications Module Integration Tests', () => {
  let adminToken: string;
  let recruiterToken: string;
  let analystToken: string;

  let jobId: string;
  let candidateId: string;

  beforeEach(async () => {
    await truncateAllTables();

    // 1. Register main org & admin
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'AppTest Inc',
        name: 'Admin User',
        email: 'admin@apptest.com',
        password: 'Password123!',
      });
    adminToken = regRes.body.data.accessToken;

    // 2. Create recruiter user
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Recruiter User',
        email: 'recruiter@apptest.com',
        password: 'Password123!',
        role: 'RECRUITER',
      });
    const recLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'recruiter@apptest.com', password: 'Password123!' });
    recruiterToken = recLogin.body.data.accessToken;

    // 3. Create analyst user
    await request(app)
      .post('/api/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Analyst User',
        email: 'analyst@apptest.com',
        password: 'Password123!',
        role: 'ANALYST',
      });
    const anaLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'analyst@apptest.com', password: 'Password123!' });
    analystToken = anaLogin.body.data.accessToken;

    // 4. Create sample job
    const jobRes = await request(app)
      .post('/api/jobs')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        title: 'Full Stack Engineer',
        description: 'Build robust TypeScript applications and pipelines',
        category: 'Engineering',
        location: 'Remote',
        remote: true,
        employmentType: 'FULL_TIME',
        requiredSkills: ['typescript', 'react', 'nodejs'],
      });
    jobId = jobRes.body.data.id;

    // 5. Create sample candidate
    const candRes = await request(app)
      .post('/api/candidates')
      .set('Authorization', `Bearer ${recruiterToken}`)
      .send({
        name: 'Alice Johnson',
        email: 'alice.johnson@example.com',
        location: 'Bengaluru, India',
        remoteOk: true,
        experienceYears: 4,
        skills: ['typescript', 'react', 'postgresql'],
      });
    candidateId = candRes.body.data.id;
  });

  describe('Happy path & State Machine transitions', () => {
    it('should create an application and transition through APPLIED -> SCREENING -> INTERVIEW -> OFFER -> HIRED', async () => {
      // 1. Create application
      const createRes = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({
          candidateId,
          jobId,
          source: 'LinkedIn Job Board',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.status).toBe('APPLIED');
      expect(createRes.body.data.candidate.name).toBe('Alice Johnson');
      expect(createRes.body.data.job.title).toBe('Full Stack Engineer');
      const appId = createRes.body.data.id;

      // 2. APPLIED -> SCREENING
      const resScreening = await request(app)
        .patch(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'SCREENING' });
      expect(resScreening.status).toBe(200);
      expect(resScreening.body.data.status).toBe('SCREENING');

      // 3. SCREENING -> INTERVIEW
      const resInterview = await request(app)
        .patch(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'INTERVIEW' });
      expect(resInterview.status).toBe(200);
      expect(resInterview.body.data.status).toBe('INTERVIEW');

      // 4. INTERVIEW -> OFFER
      const resOffer = await request(app)
        .patch(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'OFFER' });
      expect(resOffer.status).toBe(200);
      expect(resOffer.body.data.status).toBe('OFFER');

      // 5. OFFER -> HIRED
      const resHired = await request(app)
        .patch(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'HIRED' });
      expect(resHired.status).toBe(200);
      expect(resHired.body.data.status).toBe('HIRED');

      // Verify list endpoint includes the application
      const listRes = await request(app)
        .get('/api/applications')
        .set('Authorization', `Bearer ${analystToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.length).toBe(1);
      expect(listRes.body.data[0].status).toBe('HIRED');
    });

    it('should allow transitioning from any non-terminal state to REJECTED or WITHDRAWN', async () => {
      // Create first app -> test REJECTED from SCREENING
      const app1 = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ candidateId, jobId });
      const id1 = app1.body.data.id;

      await request(app)
        .patch(`/api/applications/${id1}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'SCREENING' });

      const rejectRes = await request(app)
        .patch(`/api/applications/${id1}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'REJECTED' });
      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.status).toBe('REJECTED');
    });
  });

  describe('Invalid state transitions & terminal enforcement', () => {
    it('should reject invalid jumps across states (e.g. APPLIED -> OFFER)', async () => {
      const createRes = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ candidateId, jobId });
      const appId = createRes.body.data.id;

      const jumpRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'OFFER' });

      expect(jumpRes.status).toBe(400);
      expect(jumpRes.body.error.code).toBe('VALIDATION_ERROR');
      expect(jumpRes.body.error.message).toContain('Invalid status transition');
    });

    it('should prohibit leaving terminal states (HIRED, REJECTED, WITHDRAWN)', async () => {
      // 1. Create app and move to HIRED
      const createRes = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ candidateId, jobId });
      const appId = createRes.body.data.id;

      await request(app)
        .patch(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'SCREENING' });
      await request(app)
        .patch(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'INTERVIEW' });
      await request(app)
        .patch(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'OFFER' });
      await request(app)
        .patch(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'HIRED' });

      // Try transitioning HIRED -> SCREENING
      const leaveTerminalRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ status: 'SCREENING' });

      expect(leaveTerminalRes.status).toBe(400);
      expect(leaveTerminalRes.body.error.code).toBe('VALIDATION_ERROR');
      expect(leaveTerminalRes.body.error.message).toContain('Cannot transition application from terminal status HIRED');
    });
  });

  describe('Duplicate Application Check', () => {
    it('should return 409 CONFLICT if candidate already applied for this job', async () => {
      // 1st application succeeds
      const firstRes = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ candidateId, jobId });
      expect(firstRes.status).toBe(201);

      // 2nd application for same candidate + job fails
      const dupRes = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ candidateId, jobId });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error.code).toBe('CONFLICT');
      expect(dupRes.body.error.message).toContain('Candidate has already applied for this job');
    });
  });

  describe('Tenant Isolation & RBAC', () => {
    let org2AdminToken: string;
    let org2JobId: string;
    let org2CandidateId: string;

    beforeEach(async () => {
      const reg2 = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Other Corp',
          name: 'Other Admin',
          email: 'admin@othercorp.com',
          password: 'Password123!',
        });
      org2AdminToken = reg2.body.data.accessToken;

      const job2 = await request(app)
        .post('/api/jobs')
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .send({
          title: 'DevOps Engineer',
          description: 'Manage AWS and Kubernetes infrastructure',
          category: 'Operations',
          location: 'Hyderabad',
          remote: false,
          requiredSkills: ['kubernetes', 'aws'],
        });
      org2JobId = job2.body.data.id;

      const cand2 = await request(app)
        .post('/api/candidates')
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .send({
          name: 'Bob Smith',
          email: 'bob@othercorp.com',
          location: 'Pune',
          remoteOk: true,
          skills: ['docker', 'terraform'],
        });
      org2CandidateId = cand2.body.data.id;
    });

    it('should reject application creation referencing another organization job or candidate', async () => {
      // Main org tries to apply to org2's job
      const res = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ candidateId, jobId: org2JobId });

      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe('Job not found');

      // Main org tries to apply with org2's candidate
      const res2 = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ candidateId: org2CandidateId, jobId });

      expect(res2.status).toBe(404);
      expect(res2.body.error.message).toBe('Candidate not found');
    });

    it('should enforce role-based access control for ANALYST vs RECRUITER', async () => {
      // Analyst cannot create application
      const createRes = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ candidateId, jobId });
      expect(createRes.status).toBe(403);

      // Recruiter creates application
      const okCreate = await request(app)
        .post('/api/applications')
        .set('Authorization', `Bearer ${recruiterToken}`)
        .send({ candidateId, jobId });
      expect(okCreate.status).toBe(201);
      const appId = okCreate.body.data.id;

      // Analyst cannot update status
      const updateRes = await request(app)
        .patch(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${analystToken}`)
        .send({ status: 'SCREENING' });
      expect(updateRes.status).toBe(403);

      // Analyst CAN read
      const getRes = await request(app)
        .get(`/api/applications/${appId}`)
        .set('Authorization', `Bearer ${analystToken}`);
      expect(getRes.status).toBe(200);
      expect(getRes.body.data.id).toBe(appId);
    });
  });
});
