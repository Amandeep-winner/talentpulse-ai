import request from 'supertest';
import { createApp } from '../src/app';

describe('Health and Observability Endpoints', () => {
  const app = createApp();

  it('GET /health returns 200 and valid health schema', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ok');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('timestamp');
    expect(res.body).toHaveProperty('uptime');
    expect(typeof res.body.uptime).toBe('number');
  });

  it('GET /ready returns 200 and service readiness', async () => {
    const res = await request(app).get('/ready');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status', 'ready');
    expect(res.body).toHaveProperty('services');
  });

  it('GET /metrics returns 200 and prometheus metrics content', async () => {
    const res = await request(app).get('/metrics');

    expect(res.status).toBe(200);
    expect(res.text).toContain('talentpulse_');
  });
});
