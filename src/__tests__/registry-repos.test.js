'use strict';

// Tests for v8.1.0 registry repos (typing) + retention policies in
// src/services/registry.js. Uses an in-memory SQLite. No Docker / network.

process.env.APP_SECRET = 'test-secret-key-for-jest-tests-only';
process.env.DB_PATH = ':memory:';
process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

jest.resetModules();

describe('registry repos + retention policies (v8.1.0)', () => {
  let db, registryService;

  beforeAll(() => {
    const { getDb } = require('../db');
    db = getDb();
    registryService = require('../services/registry');
    db.prepare(
      `INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'admin', 'x', 'admin')`
    ).run();
  });

  afterAll(() => {
    const { closeDb } = require('../db');
    closeDb();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM retention_policies').run();
    db.prepare('DELETE FROM registry_repos').run();
    db.prepare('DELETE FROM registries').run();
  });

  function makeRegistry(name = 'test-reg') {
    return registryService.create({
      name,
      url: 'http://test:5000',
      username: 'u',
      password: 'p',
      createdBy: 1,
    });
  }

  describe('repos CRUD', () => {
    it('listRepos returns [] for a registry with no entries', () => {
      const regId = makeRegistry();
      expect(registryService.listRepos(regId)).toEqual([]);
    });

    it('upsertRepo insert (type=local, repoPath=*) — listRepos returns 1 row with correct shape', () => {
      const regId = makeRegistry();
      const id = registryService.upsertRepo({
        registryId: regId, repoPath: '*', type: 'local',
      }, 1);
      expect(id).toBeGreaterThan(0);
      const rows = registryService.listRepos(regId);
      expect(rows).toHaveLength(1);
      const r = rows[0];
      expect(r.id).toBe(id);
      expect(r.registryId).toBe(regId);
      expect(r.repoPath).toBe('*');
      expect(r.type).toBe('local');
      expect(r.upstreamUrl).toBeNull();
      expect(r.upstreamUsername).toBeNull();
      expect(r.virtualMemberIds).toBeNull();
    });

    it('upsertRepo (type=remote, with upstreamPassword) — password is encrypted (AES-GCM iv:tag:data); not exposed in listRepos', () => {
      const regId = makeRegistry();
      const id = registryService.upsertRepo({
        registryId: regId,
        repoPath: 'remote-test',
        type: 'remote',
        upstreamUrl: 'https://docker.io',
        upstreamUsername: 'dockeruser',
        upstreamPassword: 'plaintext-secret',
      }, 1);

      const raw = db.prepare(
        'SELECT upstream_password_encrypted FROM registry_repos WHERE id = ?'
      ).get(id);
      expect(raw.upstream_password_encrypted).toBeTruthy();
      expect(raw.upstream_password_encrypted).not.toContain('plaintext-secret');
      // AES-GCM ciphertext: iv:tag:data — three colon-separated hex segments
      expect(raw.upstream_password_encrypted).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);

      const rows = registryService.listRepos(regId);
      expect(rows).toHaveLength(1);
      // The returned shape must NOT include any encrypted password field.
      expect(rows[0]).not.toHaveProperty('upstream_password_encrypted');
      expect(rows[0]).not.toHaveProperty('upstreamPassword');
      expect(rows[0]).not.toHaveProperty('upstreamPasswordEncrypted');
      expect(rows[0].upstreamUrl).toBe('https://docker.io');
      expect(rows[0].upstreamUsername).toBe('dockeruser');
    });

    it('upsertRepo (type=virtual, virtualMemberIds=array) — JSON-serialized in DB, returned as array on read', () => {
      const regId = makeRegistry();
      // Two member rows
      const m1 = registryService.upsertRepo({ registryId: regId, repoPath: 'team-a/*', type: 'local' }, 1);
      const m2 = registryService.upsertRepo({ registryId: regId, repoPath: 'team-b/*', type: 'local' }, 1);

      const vId = registryService.upsertRepo({
        registryId: regId,
        repoPath: 'all-teams',
        type: 'virtual',
        virtualMemberIds: [m1, m2],
      }, 1);

      // Verify DB stores JSON string
      const raw = db.prepare('SELECT virtual_member_ids FROM registry_repos WHERE id = ?').get(vId);
      expect(typeof raw.virtual_member_ids).toBe('string');
      expect(JSON.parse(raw.virtual_member_ids)).toEqual([m1, m2]);

      // Verify listRepos returns array (parsed)
      const rows = registryService.listRepos(regId);
      const virtual = rows.find(r => r.id === vId);
      expect(Array.isArray(virtual.virtualMemberIds)).toBe(true);
      expect(virtual.virtualMemberIds).toEqual([m1, m2]);
      expect(virtual.type).toBe('virtual');
    });

    it('upsertRepo ON CONFLICT — same (registryId, repoPath) twice with different type updates, only one row total', () => {
      const regId = makeRegistry();
      const id1 = registryService.upsertRepo({
        registryId: regId, repoPath: 'shared', type: 'local',
      }, 1);
      const id2 = registryService.upsertRepo({
        registryId: regId, repoPath: 'shared', type: 'remote', upstreamUrl: 'https://docker.io',
      }, 1);
      // Same row id (ON CONFLICT path)
      expect(id2).toBe(id1);
      const rows = registryService.listRepos(regId);
      expect(rows).toHaveLength(1);
      expect(rows[0].type).toBe('remote');
      expect(rows[0].upstreamUrl).toBe('https://docker.io');
    });

    it('upsertRepo ON CONFLICT preserves existing password if upstreamPassword undefined on update', () => {
      const regId = makeRegistry();
      const id = registryService.upsertRepo({
        registryId: regId,
        repoPath: 'preserve-test',
        type: 'remote',
        upstreamUrl: 'https://example.com',
        upstreamPassword: 'original-secret',
      }, 1);

      const before = db.prepare(
        'SELECT upstream_password_encrypted FROM registry_repos WHERE id = ?'
      ).get(id);
      expect(before.upstream_password_encrypted).toBeTruthy();

      // Update without supplying upstreamPassword
      registryService.upsertRepo({
        registryId: regId,
        repoPath: 'preserve-test',
        type: 'remote',
        upstreamUrl: 'https://updated.example.com',
        upstreamUsername: 'newuser',
      }, 1);

      const after = db.prepare(
        'SELECT upstream_password_encrypted, upstream_url, upstream_username FROM registry_repos WHERE id = ?'
      ).get(id);
      expect(after.upstream_password_encrypted).toBe(before.upstream_password_encrypted);
      expect(after.upstream_url).toBe('https://updated.example.com');
      expect(after.upstream_username).toBe('newuser');
    });

    it('deleteRepo removes the row', () => {
      const regId = makeRegistry();
      const id = registryService.upsertRepo({
        registryId: regId, repoPath: 'kill-me', type: 'local',
      }, 1);
      expect(registryService.listRepos(regId)).toHaveLength(1);
      registryService.deleteRepo(id);
      expect(registryService.listRepos(regId)).toHaveLength(0);
    });

    it('deleteRepo cascades to retention_policies (FK)', () => {
      const regId = makeRegistry();
      const id = registryService.upsertRepo({
        registryId: regId, repoPath: 'cascade-test', type: 'local',
      }, 1);
      registryService.upsertRetentionPolicy({
        registryRepoId: id,
        rule: { keepLast: 5 },
        enabled: true,
        scheduleCron: '0 3 * * *',
      }, 1);
      expect(registryService.getRetentionPolicy(id)).not.toBeNull();

      registryService.deleteRepo(id);
      const orphan = db.prepare(
        'SELECT COUNT(*) AS c FROM retention_policies WHERE registry_repo_id = ?'
      ).get(id);
      expect(orphan.c).toBe(0);
    });

    it('listRepos excludes encrypted password from returned shape (security)', () => {
      const regId = makeRegistry();
      registryService.upsertRepo({
        registryId: regId,
        repoPath: 'sec-test',
        type: 'remote',
        upstreamUrl: 'https://r.example.com',
        upstreamPassword: 'super-secret-pw',
      }, 1);
      const rows = registryService.listRepos(regId);
      expect(rows).toHaveLength(1);
      const keys = Object.keys(rows[0]);
      // No key should contain 'password' (case-insensitive) or 'encrypted'
      for (const k of keys) {
        expect(k.toLowerCase()).not.toContain('password');
        expect(k.toLowerCase()).not.toContain('encrypted');
      }
      // And no string value should accidentally leak the plaintext
      for (const v of Object.values(rows[0])) {
        if (typeof v === 'string') expect(v).not.toContain('super-secret-pw');
      }
    });

    it('resolveVirtual on a non-virtual repo returns null', () => {
      const regId = makeRegistry();
      const id = registryService.upsertRepo({
        registryId: regId, repoPath: 'just-local', type: 'local',
      }, 1);
      expect(registryService.resolveVirtual(id)).toBeNull();
    });

    it('resolveVirtual on a virtual repo returns underlying member rows', () => {
      const regId = makeRegistry();
      const m1 = registryService.upsertRepo({ registryId: regId, repoPath: 'member-a', type: 'local' }, 1);
      const m2 = registryService.upsertRepo({ registryId: regId, repoPath: 'member-b', type: 'local' }, 1);
      const vId = registryService.upsertRepo({
        registryId: regId, repoPath: 'virtual-pool', type: 'virtual',
        virtualMemberIds: [m1, m2],
      }, 1);

      const members = registryService.resolveVirtual(vId);
      expect(Array.isArray(members)).toBe(true);
      expect(members).toHaveLength(2);
      const ids = members.map(m => m.id).sort((a, b) => a - b);
      expect(ids).toEqual([m1, m2].sort((a, b) => a - b));
      // Member rows are the raw DB rows — should have repo_path
      expect(members.every(m => m.repo_path)).toBe(true);
    });

    it('resolveVirtual on a virtual repo with empty member list returns []', () => {
      const regId = makeRegistry();
      const vId = registryService.upsertRepo({
        registryId: regId, repoPath: 'empty-virtual', type: 'virtual',
        virtualMemberIds: [],
      }, 1);
      const out = registryService.resolveVirtual(vId);
      expect(Array.isArray(out)).toBe(true);
      expect(out).toHaveLength(0);
    });
  });

  describe('retention CRUD', () => {
    it('getRetentionPolicy returns null when none exists', () => {
      const regId = makeRegistry();
      const id = registryService.upsertRepo({
        registryId: regId, repoPath: 'no-policy', type: 'local',
      }, 1);
      expect(registryService.getRetentionPolicy(id)).toBeNull();
    });

    it('upsertRetentionPolicy insert — getRetentionPolicy returns row with rule parsed (object) and enabled as boolean', () => {
      const regId = makeRegistry();
      const id = registryService.upsertRepo({
        registryId: regId, repoPath: 'with-policy', type: 'local',
      }, 1);
      const rule = { keepLast: 10, keepDays: 30, dryRun: false };
      registryService.upsertRetentionPolicy({
        registryRepoId: id,
        rule,
        enabled: true,
        scheduleCron: '0 4 * * *',
      }, 1);

      const policy = registryService.getRetentionPolicy(id);
      expect(policy).not.toBeNull();
      expect(policy.registryRepoId).toBe(id);
      expect(typeof policy.rule).toBe('object');
      expect(policy.rule).toEqual(rule);
      expect(typeof policy.enabled).toBe('boolean');
      expect(policy.enabled).toBe(true);
      expect(policy.scheduleCron).toBe('0 4 * * *');
    });

    it('upsertRetentionPolicy ON CONFLICT (same registry_repo_id) updates rule + enabled, doesn\'t insert', () => {
      const regId = makeRegistry();
      const id = registryService.upsertRepo({
        registryId: regId, repoPath: 'conflict-policy', type: 'local',
      }, 1);
      registryService.upsertRetentionPolicy({
        registryRepoId: id,
        rule: { keepLast: 5 },
        enabled: true,
        scheduleCron: '0 3 * * *',
      }, 1);
      registryService.upsertRetentionPolicy({
        registryRepoId: id,
        rule: { keepLast: 20, keepDays: 60 },
        enabled: false,
        scheduleCron: '0 5 * * *',
      }, 1);

      const count = db.prepare(
        'SELECT COUNT(*) AS c FROM retention_policies WHERE registry_repo_id = ?'
      ).get(id);
      expect(count.c).toBe(1);

      const policy = registryService.getRetentionPolicy(id);
      expect(policy.rule).toEqual({ keepLast: 20, keepDays: 60 });
      expect(policy.enabled).toBe(false);
    });

    it('deleteRetentionPolicy removes the row', () => {
      const regId = makeRegistry();
      const id = registryService.upsertRepo({
        registryId: regId, repoPath: 'delete-policy', type: 'local',
      }, 1);
      registryService.upsertRetentionPolicy({
        registryRepoId: id,
        rule: { keepLast: 3 },
        enabled: true,
      }, 1);
      expect(registryService.getRetentionPolicy(id)).not.toBeNull();
      registryService.deleteRetentionPolicy(id);
      expect(registryService.getRetentionPolicy(id)).toBeNull();
    });
  });
});
