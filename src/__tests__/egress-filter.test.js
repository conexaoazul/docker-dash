'use strict';

// Unit tests for src/services/egress-filter.js (v6.7 alpha.1)

process.env.APP_SECRET = 'test-secret-for-egress-filter';
process.env.APP_ENV = 'test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'EgressTest123!';

const { getDb } = require('../db');
getDb();  // triggers migrations (including 054)

const egressFilter = require('../services/egress-filter');

// ─── canApplyFilter ───────────────────────────────────

describe('canApplyFilter', () => {
  const mk = (hc = {}) => ({ HostConfig: { NetworkMode: 'bridge', Privileged: false, CapAdd: [], ...hc } });

  it('allows a default bridge container', () => {
    expect(egressFilter.canApplyFilter(mk()).ok).toBe(true);
  });

  it('refuses privileged', () => {
    const r = egressFilter.canApplyFilter(mk({ Privileged: true }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/privileged/i);
  });

  it('refuses NET_ADMIN', () => {
    const r = egressFilter.canApplyFilter(mk({ CapAdd: ['NET_ADMIN'] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/NET_ADMIN/);
  });

  it('refuses SYS_ADMIN', () => {
    const r = egressFilter.canApplyFilter(mk({ CapAdd: ['SYS_ADMIN'] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/SYS_ADMIN/);
  });

  it('refuses network_mode=host', () => {
    const r = egressFilter.canApplyFilter(mk({ NetworkMode: 'host' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/host/);
  });

  it('refuses network_mode=none (nothing to filter)', () => {
    const r = egressFilter.canApplyFilter(mk({ NetworkMode: 'none' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/already has no network access/);
  });

  it('refuses network_mode=container:<id>', () => {
    const r = egressFilter.canApplyFilter(mk({ NetworkMode: 'container:abc' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/namespace/);
  });

  it('allows benign capabilities like SYS_NICE', () => {
    expect(egressFilter.canApplyFilter(mk({ CapAdd: ['SYS_NICE'] })).ok).toBe(true);
  });
});

// ─── listPresets ──────────────────────────────────────

describe('listPresets', () => {
  it('returns the preset catalog with resolved allowlists', () => {
    const presets = egressFilter.listPresets();
    const ids = presets.map(p => p.id);
    expect(ids).toEqual(expect.arrayContaining(['registry-only', 'registries-github', 'lockdown', 'custom', 'audit-only']));
  });

  it('registries-github preset resolves to include both sets', () => {
    const rg = egressFilter.listPresets().find(p => p.id === 'registries-github');
    expect(rg.resolvedAllowlist).toEqual(expect.arrayContaining(['docker.io', 'github.com']));
  });

  it('lockdown preset has empty allowlist', () => {
    const l = egressFilter.listPresets().find(p => p.id === 'lockdown');
    expect(l.resolvedAllowlist).toEqual([]);
  });
});

// ─── Allowlist validation ─────────────────────────────

describe('allowlist validation', () => {
  const { validateAllowlistEntry } = egressFilter._internals;

  it('accepts basic hostname', () => {
    expect(validateAllowlistEntry('registry.npmjs.org')).toBeNull();
  });

  it('accepts wildcard hostname', () => {
    expect(validateAllowlistEntry('*.github.com')).toBeNull();
  });

  it('rejects raw IP', () => {
    expect(validateAllowlistEntry('1.2.3.4')).toMatch(/IP addresses not allowed/);
  });

  it('rejects IMDS endpoint (always-blocked invariant)', () => {
    expect(validateAllowlistEntry('169.254.169.254')).toMatch(/always blocked|IP addresses/);
  });

  it('rejects garbage', () => {
    expect(validateAllowlistEntry('not a hostname!')).toMatch(/Invalid hostname/);
  });

  it('rejects single-label names (no dot)', () => {
    expect(validateAllowlistEntry('docker')).toMatch(/Invalid hostname/);
  });
});

// ─── Policy CRUD ──────────────────────────────────────

describe('createPolicy', () => {
  beforeEach(() => {
    getDb().prepare('DELETE FROM egress_policies').run();
  });

  it('creates a new policy for a container', () => {
    const r = egressFilter.createPolicy({
      scopeType: 'container', scopeKey: 'a1b2c3d4e5f6',
      preset: 'registry-only',
    });
    expect(r.updated).toBe(false);
    expect(r.policyId).toBeGreaterThan(0);
    expect(r.mode).toBe('enforce');
    expect(r.allowlist).toEqual(expect.arrayContaining(['docker.io']));
  });

  it('upserts when a policy for the same scope already exists', () => {
    const r1 = egressFilter.createPolicy({
      scopeType: 'container', scopeKey: 'a1b2c3d4e5f6',
      preset: 'registry-only',
    });
    const r2 = egressFilter.createPolicy({
      scopeType: 'container', scopeKey: 'a1b2c3d4e5f6',
      preset: 'lockdown',
    });
    expect(r2.updated).toBe(true);
    expect(r2.policyId).toBe(r1.policyId);
    expect(r2.allowlist).toEqual([]);  // lockdown
  });

  it('rejects unknown preset', () => {
    expect(() => egressFilter.createPolicy({
      scopeType: 'container', scopeKey: 'a1b2c3d4e5f6',
      preset: 'nonesuch',
    })).toThrow(/Unknown preset/);
  });

  it('rejects custom allowlist with invalid entries', () => {
    expect(() => egressFilter.createPolicy({
      scopeType: 'container', scopeKey: 'a1b2c3d4e5f6',
      preset: 'custom',
      customAllowlist: ['1.2.3.4'],  // IP not allowed
    })).toThrow(/IP addresses not allowed/);
  });

  it('audit-only preset flips mode to audit-only', () => {
    const r = egressFilter.createPolicy({
      scopeType: 'container', scopeKey: 'a1b2c3d4e5f6',
      preset: 'audit-only', mode: 'enforce',  // caller's mode ignored for audit-only preset
    });
    expect(r.mode).toBe('audit-only');
  });

  it('accepts stack scope', () => {
    const r = egressFilter.createPolicy({
      scopeType: 'stack', scopeKey: 'myapp',
      preset: 'registries-github',
    });
    expect(r.allowlist).toEqual(expect.arrayContaining(['docker.io', 'github.com']));
  });
});

describe('listPolicies / getPolicy / removePolicy', () => {
  beforeEach(() => {
    getDb().prepare('DELETE FROM egress_policies').run();
  });

  it('list returns only active policies', () => {
    egressFilter.createPolicy({ scopeType: 'container', scopeKey: 'aaaaaaaaaaaa', preset: 'registry-only' });
    egressFilter.createPolicy({ scopeType: 'stack', scopeKey: 'app1', preset: 'lockdown' });
    expect(egressFilter.listPolicies()).toHaveLength(2);

    const first = egressFilter.listPolicies()[0];
    egressFilter.removePolicy(first.id, { reason: 'test' });
    expect(egressFilter.listPolicies()).toHaveLength(1);
  });

  it('getPolicy returns null for unknown id', () => {
    expect(egressFilter.getPolicy(999999)).toBeNull();
  });

  it('getPolicyForScope finds by tuple', () => {
    egressFilter.createPolicy({ scopeType: 'container', scopeKey: 'aaaaaaaaaaaa', preset: 'registry-only' });
    const p = egressFilter.getPolicyForScope({ scopeType: 'container', scopeKey: 'aaaaaaaaaaaa' });
    expect(p).toBeTruthy();
    expect(p.preset).toBe('registry-only');
  });
});

describe('updatePolicy', () => {
  beforeEach(() => {
    getDb().prepare('DELETE FROM egress_policies').run();
  });

  it('changes preset and re-resolves allowlist', () => {
    const { policyId } = egressFilter.createPolicy({
      scopeType: 'container', scopeKey: 'aaaaaaaaaaaa', preset: 'registry-only',
    });
    const updated = egressFilter.updatePolicy(policyId, { preset: 'lockdown' });
    expect(updated.preset).toBe('lockdown');
    expect(updated.allowlist).toEqual([]);
  });

  it('can switch mode audit-only ↔ enforce', () => {
    const { policyId } = egressFilter.createPolicy({
      scopeType: 'container', scopeKey: 'aaaaaaaaaaaa', preset: 'registry-only',
    });
    expect(egressFilter.updatePolicy(policyId, { mode: 'audit-only' }).mode).toBe('audit-only');
    expect(egressFilter.updatePolicy(policyId, { mode: 'enforce' }).mode).toBe('enforce');
  });

  it('throws on unknown policy', () => {
    expect(() => egressFilter.updatePolicy(999999, {})).toThrow(/not found/);
  });
});

// ─── Block log ────────────────────────────────────────

describe('block log', () => {
  let policyId;
  beforeEach(() => {
    getDb().prepare('DELETE FROM egress_block_log').run();
    getDb().prepare('DELETE FROM egress_policies').run();
    policyId = egressFilter.createPolicy({
      scopeType: 'container', scopeKey: 'aaaaaaaaaaaa', preset: 'registry-only',
    }).policyId;
  });

  it('records and returns entries', () => {
    egressFilter.recordBlockedAttempt({ policyId, containerId: 'aaaaaaaaaaaa', hostname: 'evil.com', port: 443, proto: 'tcp', reason: 'not-in-allowlist' });
    egressFilter.recordBlockedAttempt({ policyId, containerId: 'aaaaaaaaaaaa', hostname: 'bad.io', port: 80, proto: 'tcp', reason: 'not-in-allowlist' });

    const log = egressFilter.getBlockLog(policyId);
    expect(log).toHaveLength(2);
    expect(log[0].hostname).toBe('bad.io');  // DESC order
  });

  it('filters by sinceId for incremental polling', () => {
    egressFilter.recordBlockedAttempt({ policyId, containerId: 'a', hostname: 'x.com', port: 443, proto: 'tcp' });
    egressFilter.recordBlockedAttempt({ policyId, containerId: 'a', hostname: 'y.com', port: 443, proto: 'tcp' });
    const first = egressFilter.getBlockLog(policyId);
    egressFilter.recordBlockedAttempt({ policyId, containerId: 'a', hostname: 'z.com', port: 443, proto: 'tcp' });
    const after = egressFilter.getBlockLog(policyId, { sinceId: first[0].id });
    expect(after).toHaveLength(1);
    expect(after[0].hostname).toBe('z.com');
  });

  it('cascades delete when policy is removed', () => {
    egressFilter.recordBlockedAttempt({ policyId, containerId: 'a', hostname: 'x.com', port: 443, proto: 'tcp' });
    expect(egressFilter.getBlockLog(policyId)).toHaveLength(1);

    // Hard-delete the policy to trigger FK cascade (removePolicy is soft-delete which doesn't cascade)
    getDb().prepare('DELETE FROM egress_policies WHERE id = ?').run(policyId);
    expect(getDb().prepare('SELECT COUNT(*) AS n FROM egress_block_log WHERE policy_id = ?').get(policyId).n).toBe(0);
  });

  it('rejects incomplete records', () => {
    expect(() => egressFilter.recordBlockedAttempt({ policyId })).toThrow(/missing required/);
  });

  it('prunes old entries', () => {
    egressFilter.recordBlockedAttempt({ policyId, containerId: 'a', hostname: 'x.com', port: 443, proto: 'tcp' });
    getDb().prepare(`UPDATE egress_block_log SET blocked_at = datetime('now', '-40 days') WHERE id = (SELECT MIN(id) FROM egress_block_log)`).run();
    egressFilter.recordBlockedAttempt({ policyId, containerId: 'a', hostname: 'y.com', port: 443, proto: 'tcp' });
    egressFilter.pruneOldBlockLog({ keepDays: 30 });
    const log = egressFilter.getBlockLog(policyId);
    expect(log).toHaveLength(1);
    expect(log[0].hostname).toBe('y.com');
  });
});
