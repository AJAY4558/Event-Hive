import { describe, it, expect } from 'vitest';
import { env, supportsReplicaSet } from '../../src/config/env.js';

describe('env config', () => {
  it('loads NODE_ENV as test', () => {
    expect(env.NODE_ENV).toBe('test');
  });

  it('MONGO_URI includes replicaSet', () => {
    expect(env.MONGO_URI).toContain('replicaSet=');
  });

  it('accepts Atlas SRV URIs while rejecting standalone MongoDB URIs', () => {
    expect(supportsReplicaSet('mongodb+srv://user:pass@cluster.example.mongodb.net/eventhive')).toBe(true);
    expect(supportsReplicaSet('mongodb://127.0.0.1:27017/eventhive')).toBe(false);
  });

  it('JWT_SECRET has minimum length', () => {
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it('JWT_REFRESH_SECRET has minimum length', () => {
    expect(env.JWT_REFRESH_SECRET.length).toBeGreaterThanOrEqual(32);
  });

  it('PORT is a positive integer', () => {
    expect(Number.isInteger(env.PORT)).toBe(true);
    expect(env.PORT).toBeGreaterThan(0);
  });

  it('HOLD_EXPIRY_MINUTES defaults to 15', () => {
    expect(env.HOLD_EXPIRY_MINUTES).toBe(15);
  });

  it('PAYMENT_PROVIDER defaults to sandbox', () => {
    expect(env.PAYMENT_PROVIDER).toBe('sandbox');
  });

  it('uses local image storage by default and keeps the image limit positive', () => {
    expect(env.UPLOAD_STORAGE_DRIVER).toBe('local');
    expect(env.MAX_FILE_SIZE_MB).toBeGreaterThan(0);
  });
});
