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

describe('dns-providers — Tier 1 coverage', () => {
  const TIER1 = ['cloudflare', 'route53', 'digitalocean', 'hetzner', 'linode', 'namecheap', 'gandi', 'porkbun', 'ovh'];

  it.each(TIER1)('Tier 1 provider %s is registered', (id) => {
    const p = dnsProviders.get(id);
    expect(p).toBeTruthy();
    expect(p.id).toBe(id);
  });

  it.each(TIER1)('Tier 1 provider %s — toCaddyConfig produces valid file substitutions', (id) => {
    const cfg = dnsProviders.toCaddyConfig(id, 99);
    expect(cfg.name).toBe(id === 'linode' ? 'linode' : id);
    // Every value must be a file substitution (no plaintext secrets in returned config)
    for (const [key, value] of Object.entries(cfg)) {
      if (key === 'name') continue;
      expect(value).toMatch(/^\{file\.\/etc\/caddy\/secrets\/99\//);
    }
  });

  it('list() includes all 9 providers (5 Tier-1 + 4 Tier-2)', () => {
    const ids = dnsProviders.list().map((p) => p.id).sort();
    expect(ids).toEqual([...TIER1].sort());
  });
});

describe('dns-providers — Route53 format checks (no live API)', () => {
  it('rejects missing access_key_id', async () => {
    const r = await dnsProviders.validate('route53', { secret_access_key: 'x'.repeat(40) });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/access_key_id/);
  });

  it('rejects bad-format access_key_id', async () => {
    const r = await dnsProviders.validate('route53', {
      access_key_id: 'INVALID-FORMAT',
      secret_access_key: 'x'.repeat(40),
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/Access Key ID format/);
  });

  it('rejects too-short secret_access_key', async () => {
    const r = await dnsProviders.validate('route53', {
      access_key_id: 'AKIAABCDEFGHIJKLMNOP',
      secret_access_key: 'too-short',
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/too short/);
  });

  it('accepts properly-formatted credentials (no live AWS check in v6.5)', async () => {
    const r = await dnsProviders.validate('route53', {
      access_key_id: 'AKIAABCDEFGHIJKLMNOP',
      secret_access_key: 'a'.repeat(40),
    });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/parse correctly/);
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
