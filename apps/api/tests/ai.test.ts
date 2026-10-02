import request from 'supertest';
import { createApp } from '../src/app';
import { testPrisma, truncateAllTables } from './helpers/db';
import { embeddingService } from '../src/modules/embeddings/embedding.service';

describe('Ask TalentPulse Conversational Analyst (Task 15)', () => {
  const app = createApp();

  let orgId: string;
  let adminToken: string;
  let userId: string;

  beforeAll(async () => {
    await truncateAllTables();

    // 1. Register organization and user
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({
        organizationName: 'AI Analyst Corp',
        name: 'Analyst Lead',
        email: 'analyst@aianalyst.com',
        password: 'Password123!',
      });

    adminToken = regRes.body.data.accessToken;
    orgId = regRes.body.data.user.organizationId;
    userId = regRes.body.data.user.id;

    // 2. Seed minimal test data: 2 publishers with campaign events to verify metric diagnosis
    const pubA = await testPrisma.publisher.create({
      data: {
        organizationId: orgId,
        name: 'JobBoard Prime',
        type: 'JOB_BOARD',
      },
    });

    const pubB = await testPrisma.publisher.create({
      data: {
        organizationId: orgId,
        name: 'SocialReach',
        type: 'SOCIAL',
      },
    });

    const job = await testPrisma.job.create({
      data: {
        organizationId: orgId,
        title: 'Senior Systems Engineer',
        description: 'Systems engineer with Kubernetes and Go',
        category: 'Engineering',
        location: 'Bengaluru',
        remote: true,
        employmentType: 'FULL_TIME',
        minExperienceYears: 5,
        requiredSkills: ['Go', 'Kubernetes'],
      },
    });

    const campaign = await testPrisma.campaign.create({
      data: {
        organizationId: orgId,
        jobId: job.id,
        name: 'Q1 Hiring Campaign',
        budget: 500000,
        startDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      },
    });

    // Previous period (day -45): SocialReach had high applications (100 apps, 500 clicks)
    const prevDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    await testPrisma.campaignEvent.createMany({
      data: [
        {
          eventId: 'evt-prev-pub-a-click',
          organizationId: orgId,
          campaignId: campaign.id,
          publisherId: pubA.id,
          eventType: 'CLICK',
          quantity: 200,
          timestamp: prevDate,
        },
        {
          eventId: 'evt-prev-pub-a-app',
          organizationId: orgId,
          campaignId: campaign.id,
          publisherId: pubA.id,
          eventType: 'APPLICATION',
          quantity: 50,
          timestamp: prevDate,
        },
        {
          eventId: 'evt-prev-pub-b-click',
          organizationId: orgId,
          campaignId: campaign.id,
          publisherId: pubB.id,
          eventType: 'CLICK',
          quantity: 500,
          timestamp: prevDate,
        },
        {
          eventId: 'evt-prev-pub-b-app',
          organizationId: orgId,
          campaignId: campaign.id,
          publisherId: pubB.id,
          eventType: 'APPLICATION',
          quantity: 100,
          timestamp: prevDate,
        },
      ],
    });

    // Current period (day -10): SocialReach crashed to 30 apps (500 clicks, ~70% drop)
    const currDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await testPrisma.campaignEvent.createMany({
      data: [
        {
          eventId: 'evt-curr-pub-a-click',
          organizationId: orgId,
          campaignId: campaign.id,
          publisherId: pubA.id,
          eventType: 'CLICK',
          quantity: 200,
          timestamp: currDate,
        },
        {
          eventId: 'evt-curr-pub-a-app',
          organizationId: orgId,
          campaignId: campaign.id,
          publisherId: pubA.id,
          eventType: 'APPLICATION',
          quantity: 48,
          timestamp: currDate,
        },
        {
          eventId: 'evt-curr-pub-b-click',
          organizationId: orgId,
          campaignId: campaign.id,
          publisherId: pubB.id,
          eventType: 'CLICK',
          quantity: 500,
          timestamp: currDate,
        },
        {
          eventId: 'evt-curr-pub-b-app',
          organizationId: orgId,
          campaignId: campaign.id,
          publisherId: pubB.id,
          eventType: 'APPLICATION',
          quantity: 30,
          timestamp: currDate,
        },
      ],
    });

    // Ingest sample knowledge document for RAG intent
    await request(app)
      .post('/api/knowledge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Interview Assessment Policy',
        category: 'policy',
        content:
          'Our structured interview process consists of four stages: screening, technical evaluation, architecture design, and cultural alignment.',
      });

    // Ingest sample candidate for candidate search intent
    const cand = await testPrisma.candidate.create({
      data: {
        organizationId: orgId,
        name: 'Deepak Verma',
        email: 'deepak.verma@example.com',
        location: 'Bengaluru',
        experienceYears: 6,
        skills: ['Kubernetes', 'Go', 'Docker', 'GCP'],
        remoteOk: true,
      },
    });
    await embeddingService.embedCandidate(cand.id);
  });

  afterAll(async () => {
    await truncateAllTables();
  });

  describe('POST /api/ai/query Intent Routing & Execution', () => {
    it('executes metric_diagnosis intent and names SocialReach as primary cause', async () => {
      const res = await request(app)
        .post('/api/ai/query')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          question: 'Why did applications fall this month?',
        });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.intent).toBe('metric_diagnosis');
      expect(res.body.data.answer).toContain('SocialReach');
      expect(res.body.data.steps).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Classified intent as "metric_diagnosis"'),
          expect.stringContaining('SocialReach'),
        ])
      );
      expect(res.body.data.chart).toBeDefined();
      expect(res.body.data.chart.type).toBe('bar');
      expect(res.body.data.recommendations.length).toBeGreaterThan(0);
      expect(res.body.data.conversationId).toBeDefined();
    });

    it('executes analytics_sql intent for publisher CPA query', async () => {
      const res = await request(app)
        .post('/api/ai/query')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          question: 'Which publisher has the lowest CPA?',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.intent).toBe('analytics_sql');
      expect(res.body.data.answer).toBeDefined();
      expect(res.body.data.sql).toContain('SELECT');
      expect(res.body.data.chart).toBeDefined();
    });

    it('executes knowledge intent and returns cited answer', async () => {
      const res = await request(app)
        .post('/api/ai/query')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          question: 'What is our interview policy and evaluation process?',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.intent).toBe('knowledge');
      expect(res.body.data.answer).toBeDefined();
      expect(res.body.data.citations.length).toBeGreaterThan(0);
      expect(res.body.data.citations[0].title).toBe('Interview Assessment Policy');
    });

    it('executes candidate_search intent and returns candidate matches', async () => {
      const res = await request(app)
        .post('/api/ai/query')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          question: 'Top candidates for Backend Engineer with Go and Kubernetes',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.intent).toBe('candidate_search');
      expect(res.body.data.answer).toContain('Deepak Verma');
    });

    it('executes smalltalk intent and explains capabilities', async () => {
      const res = await request(app)
        .post('/api/ai/query')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          question: 'Hello! What can you do?',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.intent).toBe('smalltalk');
      expect(res.body.data.answer).toContain('TalentPulse AI Conversational Analyst');
    });

    it('executes campaign_recommendation with optimization engine in Task 19', async () => {
      const res = await request(app)
        .post('/api/ai/query')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          question: 'How should we allocate and optimize our budget across publishers?',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.intent).toBe('campaign_recommendation');
      expect(res.body.data.answer).toContain('campaign publisher allocations');
    });

    it('handles unsupported out-of-scope questions gracefully', async () => {
      const res = await request(app)
        .post('/api/ai/query')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          question: 'Can you write a poem about ancient Byzantine pottery?',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.intent).toBe('unsupported');
      expect(res.body.data.answer).toContain('talent acquisition');
    });
  });

  describe('Conversation & Tool Call Persistence', () => {
    let savedConvId: string;

    it('persists conversation, messages, and tool call traces in PostgreSQL', async () => {
      const res = await request(app)
        .post('/api/ai/query')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          question: 'Why did applications fall this month?',
        });

      expect(res.status).toBe(200);
      savedConvId = res.body.data.conversationId;

      // Verify conversation exists in DB
      const conv = await testPrisma.aiConversation.findUnique({
        where: { id: savedConvId },
        include: {
          messages: {
            include: { toolCalls: true },
          },
        },
      });

      expect(conv).toBeDefined();
      expect(conv?.organizationId).toBe(orgId);
      expect(conv?.userId).toBe(userId);
      expect(conv?.messages.length).toBeGreaterThanOrEqual(2); // user + assistant

      // Check tool calls logged
      const assistantMsg = conv?.messages.find((m) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      expect(assistantMsg?.toolCalls.length).toBeGreaterThan(0);
      const firstCall = assistantMsg?.toolCalls[0];
      expect(firstCall?.success).toBe(true);
      expect(firstCall?.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('lists conversations for authenticated user via GET /api/ai/conversations', async () => {
      const res = await request(app)
        .get('/api/ai/conversations')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('retrieves conversation details and messages via GET /api/ai/conversations/:id', async () => {
      const res = await request(app)
        .get(`/api/ai/conversations/${savedConvId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(savedConvId);
      expect(res.body.data.messages.length).toBeGreaterThanOrEqual(2);
    });

    it('allows deleting conversation via DELETE /api/ai/conversations/:id', async () => {
      const res = await request(app)
        .delete(`/api/ai/conversations/${savedConvId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);

      const check = await testPrisma.aiConversation.findUnique({
        where: { id: savedConvId },
      });
      expect(check).toBeNull();
    });
  });
});
