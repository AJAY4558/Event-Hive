import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── authenticate middleware unit tests ─────────────────────────────────────────

describe('authenticate middleware', () => {
  let authenticate;

  beforeEach(async () => {
    const mod = await import('../../../src/middleware/authenticate.js');
    authenticate = mod.authenticate;
  });

  const makeReq = (authHeader) =>
    ({ headers: { authorization: authHeader }, cookies: {} });

  const makeRes = () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  });

  it('calls next() with a valid access token', async () => {
    const { signAccessToken } = await import('../../../src/utils/tokens.js');
    const token = signAccessToken({ userId: '123', role: 'customer', email: 't@test.com' });

    const req = makeReq(`Bearer ${token}`);
    const res = makeRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ userId: '123', role: 'customer', email: 't@test.com' });
  });

  it('returns 401 when no Authorization header', () => {
    const req = makeReq(undefined);
    const res = makeRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for malformed token', () => {
    const req = makeReq('Bearer garbage.token.value');
    const res = makeRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 with "expired" message for expired token', async () => {
    const jwt = await import('jsonwebtoken');
    const expiredToken = jwt.default.sign(
      { userId: 'x', role: 'customer', email: 'x@x.com' },
      process.env.JWT_SECRET,
      { expiresIn: -1, issuer: 'eventhive', audience: 'eventhive-client' }
    );

    const req = makeReq(`Bearer ${expiredToken}`);
    const res = makeRes();
    const next = vi.fn();

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json.mock.calls[0][0].error).toMatch(/expired/i);
  });
});

// ── authorize middleware unit tests ────────────────────────────────────────────

describe('authorize middleware', () => {
  let authorize;

  beforeEach(async () => {
    const mod = await import('../../../src/middleware/authenticate.js');
    authorize = mod.authorize;
  });

  const makeAuthReq = (role) => ({
    headers: {},
    cookies: {},
    user: { userId: '1', role, email: 'u@t.com' },
  });

  const makeRes = () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  });

  it('allows admin to pass organizer-required route', () => {
    const req = makeAuthReq('admin');
    const res = makeRes();
    const next = vi.fn();

    authorize('organizer')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('blocks customer from organizer-required route', () => {
    const req = makeAuthReq('customer');
    const res = makeRes();
    const next = vi.fn();

    authorize('organizer')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('blocks organizer from admin-required route', () => {
    const req = makeAuthReq('organizer');
    const res = makeRes();
    const next = vi.fn();

    authorize('admin')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('allows admin to pass admin-required route', () => {
    const req = makeAuthReq('admin');
    const res = makeRes();
    const next = vi.fn();

    authorize('admin')(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

// ── validate middleware unit tests ─────────────────────────────────────────────

describe('validate middleware', () => {
  let validate;

  beforeEach(async () => {
    const mod = await import('../../../src/middleware/validate.js');
    validate = mod.validate;
  });

  const makeReq = (body) => ({ body, params: {}, query: {}, cookies: {} });

  const makeRes = () => ({
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  });

  it('passes valid input and calls next()', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      body: z.object({ name: z.string().min(2), age: z.coerce.number().int().positive() }),
    });

    const req = makeReq({ name: 'Alice', age: '25' });
    const res = makeRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body.age).toBe(25);
  });

  it('returns 422 with field errors for invalid input', async () => {
    const { z } = await import('zod');
    const schema = z.object({
      body: z.object({ name: z.string().min(2), age: z.coerce.number().int().positive() }),
    });

    const req = makeReq({ name: 'A', age: -1 });
    const res = makeRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json.mock.calls[0][0].error).toBe('Validation failed');
    expect(res.json.mock.calls[0][0].fields.name).toBeDefined();
    expect(next).not.toHaveBeenCalled();
  });
});

// ── Token utility unit tests ───────────────────────────────────────────────────

describe('token utilities', () => {
  it('signs and verifies an access token', async () => {
    const { signAccessToken, verifyAccessToken } = await import('../../../src/utils/tokens.js');
    const payload = { userId: 'abc', role: 'customer', email: 'a@b.com' };
    const token = signAccessToken(payload);
    const decoded = verifyAccessToken(token);

    expect(decoded.userId).toBe('abc');
    expect(decoded.role).toBe('customer');
    expect(decoded.email).toBe('a@b.com');
  });

  it('throws on tampered access token', async () => {
    const { signAccessToken, verifyAccessToken } = await import('../../../src/utils/tokens.js');
    const token = signAccessToken({ userId: 'x', role: 'admin', email: 'x@x.com' });
    const tampered = token.slice(0, -5) + 'XXXXX';

    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('ROLE_HIERARCHY: admin > organizer > customer', async () => {
    const { ROLE_HIERARCHY } = await import('../../../src/utils/tokens.js');

    expect(ROLE_HIERARCHY.admin).toBeGreaterThan(ROLE_HIERARCHY.organizer);
    expect(ROLE_HIERARCHY.organizer).toBeGreaterThan(ROLE_HIERARCHY.customer);
  });
});
