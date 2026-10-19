import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import supertest from 'supertest';
import mongoose from 'mongoose';
import { createApp } from '../../src/app.js';
import { connectDb, disconnectDb } from '../../src/config/db.js';
import { User } from '../../src/models/User.js';

// NOTE: These tests require MongoDB running as replica set rs0.
// Run mongo-rs/init-replica-set.ps1 first if they fail with a connection error.

describe('Phase 2 — Authentication & Authorization', () => {
  let request;

  beforeAll(async () => {
    await connectDb();
    request = supertest(createApp());
  }, 30_000);

  afterAll(async () => {
    await disconnectDb();
  }, 10_000);

  afterEach(async () => {
    await User.deleteMany({ email: /@test\.eventhive\.dev$/ });
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  const testUser = (suffix = '') => ({
    name: 'Test User',
    email: `user${suffix}@test.eventhive.dev`,
    password: 'SecurePass1',
  });

  async function registerAndGetToken(suffix = '') {
    const res = await request.post('/api/auth/register').send(testUser(suffix));
    expect(res.status).toBe(201);
    return res.body.accessToken;
  }

  // ── Registration ───────────────────────────────────────────────────────────

  describe('POST /api/auth/register', () => {
    it('registers a new customer and returns accessToken + user', async () => {
      const res = await request.post('/api/auth/register').send(testUser());

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.user.email).toBe(testUser().email);
      expect(res.body.user.role).toBe('customer');
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.user.passwordResetTokenHash).toBeUndefined();
    });

    it('sets httpOnly refresh token cookie on register', async () => {
      const res = await request.post('/api/auth/register').send(testUser());

      const cookies = res.headers['set-cookie'];
      const refreshCookie = (cookies || []).find((c) => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeTruthy();
      expect(refreshCookie).toContain('HttpOnly');
      expect(refreshCookie).toContain('Path=/api/auth/refresh');
    });

    it('registers as organizer role', async () => {
      const res = await request.post('/api/auth/register').send({ ...testUser(), role: 'organizer' });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('organizer');
    });

    it('prevents self-registration as admin', async () => {
      const res = await request.post('/api/auth/register').send({ ...testUser(), role: 'admin' });

      expect([422, 400].includes(res.status)).toBe(true);
    });

    it('returns 409 for duplicate email', async () => {
      await request.post('/api/auth/register').send(testUser());
      const res = await request.post('/api/auth/register').send(testUser());

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already exists/i);
    });

    it('returns 422 for missing fields', async () => {
      const res = await request.post('/api/auth/register').send({ email: 'bad@test.eventhive.dev' });

      expect(res.status).toBe(422);
      expect(res.body.fields).toBeDefined();
    });

    it('returns 422 for weak password (no uppercase)', async () => {
      const res = await request.post('/api/auth/register').send({ ...testUser(), password: 'weakpass1' });

      expect(res.status).toBe(422);
    });

    it('returns 422 for invalid email', async () => {
      const res = await request.post('/api/auth/register').send({ ...testUser(), email: 'not-an-email' });

      expect(res.status).toBe(422);
    });
  });

  // ── Login ──────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('logs in with correct credentials', async () => {
      await request.post('/api/auth/register').send(testUser());

      const res = await request.post('/api/auth/login').send({ email: testUser().email, password: testUser().password });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.user.email).toBe(testUser().email);
    });

    it('returns 401 for wrong password', async () => {
      await request.post('/api/auth/register').send(testUser());

      const res = await request.post('/api/auth/login').send({ email: testUser().email, password: 'WrongPass1' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password.');
    });

    it('returns 401 for non-existent user', async () => {
      const res = await request.post('/api/auth/login').send({ email: 'ghost@test.eventhive.dev', password: 'SecurePass1' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password.');
    });

    it('returns 422 for missing password', async () => {
      const res = await request.post('/api/auth/login').send({ email: testUser().email });

      expect(res.status).toBe(422);
    });
  });

  // ── Logout ─────────────────────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('clears the refresh token cookie', async () => {
      const res = await request.post('/api/auth/logout');

      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'];
      const cleared = (cookies || []).find((c) => c.startsWith('refreshToken='));
      expect(cleared).toBeTruthy();
      expect(cleared).toContain('Max-Age=0');
    });
  });

  // ── Protected route /me ────────────────────────────────────────────────────

  describe('GET /api/auth/me', () => {
    it('returns current user with valid token', async () => {
      const token = await registerAndGetToken();

      const res = await request.get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(testUser().email);
    });

    it('returns 401 without token', async () => {
      const res = await request.get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns 401 with malformed token', async () => {
      const res = await request.get('/api/auth/me').set('Authorization', 'Bearer totally.invalid.token');
      expect(res.status).toBe(401);
    });

    it('returns 401 with expired token', async () => {
      const jwt = await import('jsonwebtoken');
      const expiredToken = jwt.default.sign(
        { userId: 'x', role: 'customer', email: 'x@x.com' },
        process.env.JWT_SECRET,
        { expiresIn: -1 }
      );

      const res = await request.get('/api/auth/me').set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/expired/i);
    });
  });

  // ── Role-based authorization ────────────────────────────────────────────────

  describe('Authorization — role escalation and protection', () => {
    it('customer token has customer role', async () => {
      const token = await registerAndGetToken();
      const meRes = await request.get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(meRes.body.user.role).toBe('customer');
    });

    it('admin role cannot be set via registration', async () => {
      const res = await request.post('/api/auth/register').send({
        name: 'Rogue Admin',
        email: 'rogue@test.eventhive.dev',
        password: 'SecurePass1',
        role: 'admin',
      });

      if (res.status === 201) {
        expect(res.body.user.role).not.toBe('admin');
      } else {
        expect(res.status).toBe(422);
      }
    });
  });

  // ── Profile update ─────────────────────────────────────────────────────────

  describe('PATCH /api/auth/profile', () => {
    it('updates name and phone', async () => {
      const token = await registerAndGetToken();

      const res = await request.patch('/api/auth/profile').set('Authorization', `Bearer ${token}`).send({ name: 'Updated Name', phone: '+919876543210' });

      expect(res.status).toBe(200);
      expect(res.body.user.name).toBe('Updated Name');
      expect(res.body.user.phone).toBe('+919876543210');
    });

    it('returns 401 without auth', async () => {
      const res = await request.patch('/api/auth/profile').send({ name: 'Hacker' });
      expect(res.status).toBe(401);
    });

    it('returns 422 for invalid phone', async () => {
      const token = await registerAndGetToken();

      const res = await request.patch('/api/auth/profile').set('Authorization', `Bearer ${token}`).send({ phone: 'not-a-phone' });

      expect(res.status).toBe(422);
    });
  });

  // ── Change password ────────────────────────────────────────────────────────

  describe('POST /api/auth/change-password', () => {
    it('changes password and clears refresh cookie', async () => {
      const token = await registerAndGetToken();

      const res = await request.post('/api/auth/change-password').set('Authorization', `Bearer ${token}`).send({
        currentPassword: testUser().password,
        newPassword: 'NewSecure1',
        confirmNewPassword: 'NewSecure1',
      });

      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'];
      const cleared = (cookies || []).find((c) => c.startsWith('refreshToken='));
      expect(cleared).toContain('Max-Age=0');
    });

    it('rejects wrong current password', async () => {
      const token = await registerAndGetToken();

      const res = await request.post('/api/auth/change-password').set('Authorization', `Bearer ${token}`).send({
        currentPassword: 'WrongPass1',
        newPassword: 'NewSecure1',
        confirmNewPassword: 'NewSecure1',
      });

      expect(res.status).toBe(400);
    });

    it('rejects mismatched confirm password', async () => {
      const token = await registerAndGetToken();

      const res = await request.post('/api/auth/change-password').set('Authorization', `Bearer ${token}`).send({
        currentPassword: testUser().password,
        newPassword: 'NewSecure1',
        confirmNewPassword: 'DifferentPass1',
      });

      expect(res.status).toBe(422);
    });

    it('rejects same password as current', async () => {
      const token = await registerAndGetToken();

      const res = await request.post('/api/auth/change-password').set('Authorization', `Bearer ${token}`).send({
        currentPassword: testUser().password,
        newPassword: testUser().password,
        confirmNewPassword: testUser().password,
      });

      expect(res.status).toBe(422);
    });
  });

  // ── Password reset flow ────────────────────────────────────────────────────

  describe('Forgot/Reset password flow', () => {
    it('forgot-password always returns 200 (no user enumeration)', async () => {
      const res = await request.post('/api/auth/forgot-password').send({ email: 'ghost@test.eventhive.dev' });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account/i);
    });

    it('full reset flow: request token → reset password → login with new password', async () => {
      await request.post('/api/auth/register').send(testUser());

      const forgotRes = await request.post('/api/auth/forgot-password').send({ email: testUser().email });

      expect(forgotRes.status).toBe(200);
      const rawToken = forgotRes.body._devToken;
      expect(rawToken).toBeTruthy();

      const resetRes = await request.post(`/api/auth/reset-password/${rawToken}`).send({ password: 'ResetPass1', confirmPassword: 'ResetPass1' });
      expect(resetRes.status).toBe(200);

      const oldLoginRes = await request.post('/api/auth/login').send({ email: testUser().email, password: testUser().password });
      expect(oldLoginRes.status).toBe(401);

      const newLoginRes = await request.post('/api/auth/login').send({ email: testUser().email, password: 'ResetPass1' });
      expect(newLoginRes.status).toBe(200);
    });

    it('rejects invalid reset token', async () => {
      const res = await request.post('/api/auth/reset-password/invalidtoken').send({ password: 'ResetPass1', confirmPassword: 'ResetPass1' });
      expect(res.status).toBe(400);
    });

    it('rejects reuse of a reset token (one-time)', async () => {
      await request.post('/api/auth/register').send(testUser());

      const forgotRes = await request.post('/api/auth/forgot-password').send({ email: testUser().email });
      const rawToken = forgotRes.body._devToken;

      await request.post(`/api/auth/reset-password/${rawToken}`).send({ password: 'ResetPass1', confirmPassword: 'ResetPass1' });

      const secondRes = await request.post(`/api/auth/reset-password/${rawToken}`).send({ password: 'AnotherPass1', confirmPassword: 'AnotherPass1' });
      expect(secondRes.status).toBe(400);
    });
  });

  // ── Token refresh ──────────────────────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    it('issues new access token using refresh cookie', async () => {
      const registerRes = await request.post('/api/auth/register').send(testUser());

      const cookies = registerRes.headers['set-cookie'];
      const cookieHeader = cookies.join('; ');

      const res = await request.post('/api/auth/refresh').set('Cookie', cookieHeader);

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
    });

    it('returns 422 when no refresh cookie present', async () => {
      const res = await request.post('/api/auth/refresh');
      expect([401, 422].includes(res.status)).toBe(true);
    });
  });
});
