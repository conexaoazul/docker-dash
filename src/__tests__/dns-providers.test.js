'use strict';

// Tests for src/services/dns-providers.js (v6.5 LE Wizard)

process.env.APP_ENV = 'test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32chars';

const dnsProviders = require('../services/dns-providers');

describe('dns-providers — registry shape', () => {
  it('list() returns at least one provider', () => {
    const list = dnsProviders.list();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(0);
  });

  it('list() returns serializable entries (no functions)', () => {
    const list = dnsProviders.list();
    const json = JSON.stringify(list);
    expect(json.length).toBeGreaterThan(0);
    for (const p of list) {
      expect(typeof p.validate).toBe('undefined');
      expect(typeof p.toCaddyConfig).toBe('undefined');
    }
  });

  it('every provider has required fields', () => {
    const list = dnsProviders.list();
    for (const p of list) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.docsUrl).toBe('string');
      expect(typeof p.caddyConfigKey).toBe('string');
      expect(Array.isArray(p.fields)).toBe(true);
      expect(p.fields.length).toBeGreaterThan(0);
      for (const f of p.fields) {
        expect(typeof f.key).toBe('string');
        expect(typeof f.label).toBe('string');
        expect(['text', 'password']).toContain(f.type);
      }
    }
  });

  it('get(id) returns the full spec including functions', () => {
    const cf = dnsProviders.get('cloudflare');
    expect(cf).toBeTruthy();
    expect(typeof cf.validate).toBe('function');
    expect(typeof cf.toCaddyConfig).toBe('function');
  });

  it('get(unknown) returns null', () => {
    expect(dnsProviders.get('not-a-provider')).toBeNull();
  });
});

describe('dns-providers — Cloudflare provider', () => {
  it('toCaddyConfig produces the expected file-substitution shape', () => {
    const cfg = dnsProviders.toCaddyConfig('cloudflare', 42);
    expect(cfg).toEqual({
      name: 'cloudflare',
      api_token: '{file./etc/caddy/secrets/42/api_token}',
    });
  });

  it('validate rejects empty credentials', async () => {
    const r = await dnsProviders.validate('cloudflare', {});
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/api_token/);
  });

  it('validate flags Cloudflare Global API Key format (37 hex chars)', async () => {
    const fakeGlobalKey = 'a'.repeat(37);
    const r = await dnsProviders.validate('cloudflare', { api_token: fakeGlobalKey });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Global API Key/i);
  });

  it('validate accepts the format of a scoped token (without verifying upstream)', async () => {
    // We don't have a real token to test — just verify the format check passes
    // and the failure (if any) is from network/upstream, not from our heuristic.
    const r = await dnsProviders.validate('cloudflare', {
      api_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.fake.token',
    });
    // We expect ok:false (Cloudflare will reject the fake), but NOT due to format
    expect(r.message).not.toMatch(/Global API Key/i);
  });
});

describe('dns-providers — error paths', () => {
  it('toCaddyConfig throws on unknown provider', () => {
    expect(() => dnsProviders.toCaddyConfig('not-a-provider', 1)).toThrow();
  });

  it('validate returns failure on unknown provider', async () => {
    const r = await dnsProviders.validate('not-a-provider', {});
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Unknown provider/);
  });
});
