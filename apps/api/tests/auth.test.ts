import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app';
import { testPrisma, truncateAllTables } from './helpers/db';
import { env } from '../src/config/env';

const app = createApp();

function getRefreshToken(res: request.Response): string {
  const cookieHeader = res.headers['set-cookie'];
  const cookies = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader || ''];
  if (!cookies[0]) {
    throw new Error('Expected set-cookie header');
  }
  const match = cookies[0].match(/refreshToken=([^;]+)/);
  if (!match || !match[1]) {
    throw new Error('Expected refreshToken cookie to be present');
  }
  return match[1];
}

describe('Authentication & Authorization Integration Tests', () => {
  beforeEach(async () => {
    await truncateAllTables();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  describe('Registration & Login Happy Path', () => {
    it('registers an organization and ADMIN user, returning access token and setting cookie', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Acme Corp',
          name: 'Jane Doe',
          email: 'jane@acme.com',
          password: 'Password123!',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.email).toBe('jane@acme.com');
      expect(res.body.data.user.role).toBe('ADMIN');
      expect(res.body.data.user.organizationName).toBe('Acme Corp');
      expect(res.body.data.accessToken).toBeDefined();

      const cookieHeader = res.headers['set-cookie'];
      const cookies = Array.isArray(cookieHeader) ? cookieHeader : [cookieHeader || ''];
      expect(cookies[0]).toMatch(/refreshToken=/);
      expect(cookies[0]).toMatch(/HttpOnly/i);

      // Verify DB records
      const org = await testPrisma.organization.findFirst({
        where: { name: 'Acme Corp' },
      });
      expect(org).not.toBeNull();

      const user = await testPrisma.user.findUnique({
        where: { email: 'jane@acme.com' },
      });
      expect(user).not.toBeNull();
      expect(user?.role).toBe('ADMIN');

      const tokenCount = await testPrisma.refreshToken.count({
        where: { userId: user?.id },
      });
      expect(tokenCount).toBe(1);
    });

    it('logs in an existing user and returns access token + refresh cookie', async () => {
      // Register user first
      await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Acme Corp',
          name: 'Jane Doe',
          email: 'jane@acme.com',
          password: 'Password123!',
        });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'jane@acme.com',
          password: 'Password123!',
        });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.email).toBe('jane@acme.com');
      expect(loginRes.body.data.accessToken).toBeDefined();
      expect(loginRes.headers['set-cookie']).toBeDefined();
    });
  });

  describe('Validation & Authentication Failures', () => {
    it('rejects weak password with 400 validation error', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Acme Corp',
          name: 'Jane Doe',
          email: 'jane@acme.com',
          password: 'weak',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects duplicate email with 409 CONFLICT', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Acme Corp',
          name: 'Jane Doe',
          email: 'jane@acme.com',
          password: 'Password123!',
        });

      const duplicateRes = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Another Corp',
          name: 'Jane Clone',
          email: 'jane@acme.com',
          password: 'Password123!',
        });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.error.code).toBe('CONFLICT');
    });

    it('rejects wrong password with 401 UNAUTHENTICATED', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Acme Corp',
          name: 'Jane Doe',
          email: 'jane@acme.com',
          password: 'Password123!',
        });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'jane@acme.com',
          password: 'WrongPassword999!',
        });

      expect(loginRes.status).toBe(401);
      expect(loginRes.body.error.code).toBe('UNAUTHENTICATED');
    });

    it('rejects expired or invalid access token with 401 UNAUTHENTICATED', async () => {
      const invalidTokenRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid.token.payload');

      expect(invalidTokenRes.status).toBe(401);

      // Expired token
      const expiredToken = jwt.sign(
        { id: 'random-id', email: 'test@example.com', role: 'ADMIN', organizationId: 'random-org' },
        env.JWT_ACCESS_SECRET,
        { expiresIn: -10 },
      );

      const expiredRes = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(expiredRes.status).toBe(401);
      expect(expiredRes.body.error.message).toMatch(/expired/i);
    });
  });

  describe('Refresh Token Rotation & Reuse Detection', () => {
    it('rotates refresh token on /api/auth/refresh and revokes previous token', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Acme Corp',
          name: 'Jane Doe',
          email: 'jane@acme.com',
          password: 'Password123!',
        });

      const initialToken = getRefreshToken(regRes);

      // Refresh token
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${initialToken}`);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.accessToken).toBeDefined();

      const newToken = getRefreshToken(refreshRes);
      expect(newToken).not.toBe(initialToken);
    });

    it('detects refresh token reuse and revokes entire token family', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Acme Corp',
          name: 'Jane Doe',
          email: 'jane@acme.com',
          password: 'Password123!',
        });

      const initialToken = getRefreshToken(regRes);

      // Legitimate client refreshes token
      const refreshRes1 = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${initialToken}`);
      expect(refreshRes1.status).toBe(200);

      const secondToken = getRefreshToken(refreshRes1);

      // Attacker tries to reuse the initial token
      const attackRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${initialToken}`);
      expect(attackRes.status).toBe(401);
      expect(attackRes.body.error.message).toMatch(/reuse detected/i);

      // Now even the legitimate second token must be revoked because the entire family was invalidated!
      const legitRes2 = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${secondToken}`);
      expect(legitRes2.status).toBe(401);
    });

    it('logs out and revokes the active token family', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Acme Corp',
          name: 'Jane Doe',
          email: 'jane@acme.com',
          password: 'Password123!',
        });

      const token = getRefreshToken(regRes);

      const logoutRes = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', `refreshToken=${token}`);
      expect(logoutRes.status).toBe(200);

      // Further refresh with that token fails
      const refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', `refreshToken=${token}`);
      expect(refreshRes.status).toBe(401);
    });
  });

  describe('RBAC & User Management', () => {
    it('allows ADMIN to create, list, and update role of users in their org', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Acme Corp',
          name: 'Admin Jane',
          email: 'admin@acme.com',
          password: 'Password123!',
        });

      const adminToken = regRes.body.data.accessToken;

      // Create a RECRUITER
      const createRes = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Recruiter Bob',
          email: 'bob@acme.com',
          password: 'Password123!',
          role: 'RECRUITER',
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.data.email).toBe('bob@acme.com');
      expect(createRes.body.data.role).toBe('RECRUITER');

      const recruiterId = createRes.body.data.id;

      // List users
      const listRes = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(2);

      // Update role to ANALYST
      const patchRes = await request(app)
        .patch(`/api/users/${recruiterId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'ANALYST' });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.role).toBe('ANALYST');

      // Login as recruiter (now analyst)
      const recLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: 'bob@acme.com', password: 'Password123!' });
      const recToken = recLogin.body.data.accessToken;

      // Analyst cannot manage users (403 FORBIDDEN)
      const forbiddenRes = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${recToken}`);
      expect(forbiddenRes.status).toBe(403);
      expect(forbiddenRes.body.error.code).toBe('FORBIDDEN');

      // Admin deletes user
      const deleteRes = await request(app)
        .delete(`/api/users/${recruiterId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleteRes.status).toBe(200);
    });

    it('enforces multi-tenant cross-organization isolation for user management', async () => {
      // Org 1
      const org1Res = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Org One',
          name: 'Admin One',
          email: 'admin1@orgone.com',
          password: 'Password123!',
        });
      const org1Token = org1Res.body.data.accessToken;

      // Org 2
      const org2Res = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Org Two',
          name: 'Admin Two',
          email: 'admin2@orgtwo.com',
          password: 'Password123!',
        });
      const org2UserId = org2Res.body.data.user.id;

      // Org 1 tries to delete Org 2 user
      const crossDeleteRes = await request(app)
        .delete(`/api/users/${org2UserId}`)
        .set('Authorization', `Bearer ${org1Token}`);

      expect(crossDeleteRes.status).toBe(404);

      // Org 1 user list only contains Org 1 users
      const org1List = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${org1Token}`);
      expect(org1List.body.data).toHaveLength(1);
      expect(org1List.body.data[0].email).toBe('admin1@orgone.com');
    });
  });

  describe('API Key Management & Authentication', () => {
    it('creates API key, displays plaintext key once, lists keys, and revokes key', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({
          organizationName: 'Acme Corp',
          name: 'Admin Jane',
          email: 'admin@acme.com',
          password: 'Password123!',
        });
      const adminToken = regRes.body.data.accessToken;
      const orgId = regRes.body.data.user.organizationId;

      // Create API key
      const createKeyRes = await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'CI Ingestion Key' });

      expect(createKeyRes.status).toBe(201);
      const plaintextKey = createKeyRes.body.data.plaintextKey;
      expect(plaintextKey).toMatch(/^tp_live_/);
      expect(createKeyRes.body.data.apiKey.name).toBe('CI Ingestion Key');
      expect(createKeyRes.body.data.apiKey.keyPrefix).toBeDefined();

      const keyId = createKeyRes.body.data.apiKey.id;

      // Verify authenticating with the API key via authenticateKeyOrJwt
      const authKeyRes = await request(app)
        .get('/api/test-key-auth')
        .set('x-api-key', plaintextKey);
      expect(authKeyRes.status).toBe(200);
      expect(authKeyRes.body.data.organizationId).toBe(orgId);

      // List keys
      const listRes = await request(app)
        .get('/api/api-keys')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data).toHaveLength(1);
      expect(listRes.body.data[0].id).toBe(keyId);

      // Revoke key
      const revokeRes = await request(app)
        .delete(`/api/api-keys/${keyId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(revokeRes.status).toBe(200);

      // Accessing with revoked API key should fail
      const revokedKeyAttempt = await request(app)
        .get('/api/test-key-auth')
        .set('x-api-key', plaintextKey);
      expect(revokedKeyAttempt.status).toBe(401);

      // List keys is now empty
      const listAfterRevoke = await request(app)
        .get('/api/api-keys')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listAfterRevoke.body.data).toHaveLength(0);
    });
  });
});
