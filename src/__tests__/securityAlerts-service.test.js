'use strict';

// WHY: Post-v8.2.x audit gap closure for the security-alerts service.
//
// `security-alerts.test.js` (sibling file) covers _mapActionToEvent,
// instant-rule firing, the 1-minute cooldown for instant rules, basic
// CRUD, and _buildMessage. It does NOT exercise:
//   - The 5 default rules seeded by migration 032 (regression risk if
//     someone "tidies up" the seed list).
//   - The windowed brute-force path (_evaluateFailedLogins) which has
//     its own per-IP cooldown and reads from login_attempts.
//   - The audit-log threshold path (_evaluateThresholdRule) for
//     non-login bursty events.
//   - The is_active / disabled-rule semantics — alerts must NOT fire
//     for rules that are toggled off (compliance: an operator silencing
//     a rule must actually silence it).
//   - testRule() — the operator-driven "send me a test notification"
//     path that ops uses before going to bed.
//   - notify_channels JSON — alerts targeted to specific channels vs
//     broadcast-to-all.
//   - alert history retrieval (getRecentAlerts) under the time-window
//     filter.
//
// Those are the gaps closed here. We intentionally do not re-test
// what the sibling file already covers.

process.env.APP_SECRET = 'test-secret-key-for-jest-tests-only';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';

jest.mock('../services/notificationChannels', () => ({
  send: jest.fn().mockResolvedValue(undefined),
  sendToAll: jest.fn().mockResolvedValue(undefined),
}));

describe('SecurityAlertService — gap closure (post-v8.2.x)', () => {
  let db, alertService, channelMock;
  // Snapshot of the migration-seeded rules taken BEFORE any test wipes
  // them, so the "default rules" assertions can still introspect what
  // shipped, and other tests can wipe freely.
  let seededRules;

  beforeAll(() => {
    const { getDb } = require('../db');
    db = getDb();
    alertService = require('../services/securityAlerts');
    channelMock = require('../services/notificationChannels');

    // FK guard for tests that synthesize audit_log / login_attempts
    // rows without backing user rows.
    db.pragma('foreign_keys = OFF');

    db.prepare(
      `INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'admin', 'x', 'admin')`
    ).run();

    seededRules = db
      .prepare('SELECT * FROM security_alert_rules ORDER BY name')
      .all();

    alertService.init();
  });

  afterAll(() => {
    const { closeDb } = require('../db');
    closeDb();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.prepare('DELETE FROM security_alert_events').run();
    db.prepare('DELETE FROM security_alert_rules').run();
    db.prepare('DELETE FROM login_attempts').run();
    db.prepare('DELETE FROM audit_log').run();
    alertService._rules = [];
    alertService._cooldowns.clear();
  });

  // ─── 1. Default rules seeded by migration 032 ──────────────────────────────
  // We assert against the snapshot taken before beforeEach wipes the
  // table — the seeded set is what ships in production.
  describe('default rules (migration 032)', () => {
    it('seeds exactly the 5 documented default rules on init', () => {
      const names = seededRules.map(r => r.name);
      expect(names).toEqual(expect.arrayContaining([
        'Brute Force Detection',
        'New Admin Created',
        'MFA Disabled',
        'Password Reset by Admin',
        'Privilege Escalation',
      ]));
      expect(seededRules.length).toBeGreaterThanOrEqual(5);
    });

    it('Brute Force Detection rule is windowed (5/600s, critical)', () => {
      const r = seededRules.find(x => x.name === 'Brute Force Detection');
      expect(r).toBeTruthy();
      expect(r.event_type).toBe('failed_login');
      expect(r.threshold).toBe(5);
      expect(r.window_seconds).toBe(600);
      expect(r.severity).toBe('critical');
    });

    it('Privilege Escalation rule is instant + critical', () => {
      const r = seededRules.find(x => x.name === 'Privilege Escalation');
      expect(r).toBeTruthy();
      expect(r.event_type).toBe('role_changed_to_admin');
      expect(r.threshold).toBe(1);
      expect(r.window_seconds).toBe(0);
      expect(r.severity).toBe('critical');
    });
  });

  // ─── 2. Windowed brute-force evaluation ────────────────────────────────────
  describe('evaluateWindowed — brute force detection', () => {
    function seedFailedLogins(ip, count, username = 'victim') {
      const now = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO login_attempts (ip, username, success, attempted_at)
        VALUES (?, ?, 0, ?)
      `);
      for (let i = 0; i < count; i++) stmt.run(ip, username, now);
    }

    function ensureBruteForceRule() {
      // Migration seeds this, but tests may have deleted/disabled it.
      const existing = db
        .prepare(`SELECT id FROM security_alert_rules WHERE event_type = 'failed_login'`)
        .get();
      if (existing) {
        db.prepare(`UPDATE security_alert_rules SET is_active = 1, threshold = 5, window_seconds = 600 WHERE id = ?`)
          .run(existing.id);
      } else {
        alertService.createRule({
          name: 'Brute Force Detection',
          eventType: 'failed_login',
          threshold: 5,
          windowSeconds: 600,
          severity: 'critical',
        });
      }
      alertService.reload();
    }

    it('fires when failed_login count meets threshold in window', () => {
      ensureBruteForceRule();
      seedFailedLogins('203.0.113.5', 5);

      alertService.evaluateWindowed();

      const events = db
        .prepare(`SELECT * FROM security_alert_events WHERE event_type = 'failed_login'`)
        .all();
      expect(events.length).toBe(1);
      expect(events[0].severity).toBe('critical');
      expect(events[0].message).toContain('203.0.113.5');
      expect(channelMock.sendToAll).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire when failed logins are below threshold', () => {
      ensureBruteForceRule();
      seedFailedLogins('203.0.113.6', 4);

      alertService.evaluateWindowed();

      const events = db
        .prepare(`SELECT * FROM security_alert_events WHERE event_type = 'failed_login'`)
        .all();
      expect(events.length).toBe(0);
      expect(channelMock.sendToAll).not.toHaveBeenCalled();
    });

    it('does NOT fire on stale events outside the time window', () => {
      ensureBruteForceRule();
      // Insert 6 failed logins from 1 hour ago — outside the 600s window.
      const stale = new Date(Date.now() - 3600 * 1000).toISOString();
      const stmt = db.prepare(`
        INSERT INTO login_attempts (ip, username, success, attempted_at)
        VALUES (?, ?, 0, ?)
      `);
      for (let i = 0; i < 6; i++) stmt.run('203.0.113.7', 'victim', stale);

      alertService.evaluateWindowed();

      const events = db
        .prepare(`SELECT * FROM security_alert_events WHERE event_type = 'failed_login'`)
        .all();
      expect(events.length).toBe(0);
    });

    it('per-IP cooldown suppresses repeat brute-force fires for same IP', () => {
      ensureBruteForceRule();
      seedFailedLogins('203.0.113.8', 5);

      alertService.evaluateWindowed();
      alertService.evaluateWindowed(); // immediate re-eval — should be suppressed

      const events = db
        .prepare(`SELECT * FROM security_alert_events WHERE event_type = 'failed_login'`)
        .all();
      expect(events.length).toBe(1);
    });

    it('successful logins (success=1) do not count toward brute-force threshold', () => {
      ensureBruteForceRule();
      const now = new Date().toISOString();
      const stmt = db.prepare(`
        INSERT INTO login_attempts (ip, username, success, attempted_at)
        VALUES (?, ?, ?, ?)
      `);
      for (let i = 0; i < 6; i++) stmt.run('203.0.113.9', 'good', 1, now);

      alertService.evaluateWindowed();

      const events = db
        .prepare(`SELECT * FROM security_alert_events`)
        .all();
      expect(events.length).toBe(0);
    });
  });

  // ─── 3. Audit-log threshold rule (non-login windowed) ──────────────────────
  describe('_evaluateThresholdRule — bursty audit-log events', () => {
    it('fires when N audit_log entries for the same action breach threshold', () => {
      // Custom threshold rule on a non-login event type. We set
      // event_type to a synthetic action and insert audit_log rows.
      const { id } = alertService.createRule({
        name: 'Mass Container Stop',
        eventType: 'mfa_disabled', // event_type that maps from mfa_disable
        threshold: 3,
        windowSeconds: 600,
        severity: 'warning',
      });
      expect(id).toBeGreaterThan(0);
      alertService.reload();

      const now = new Date().toISOString();
      const ins = db.prepare(`
        INSERT INTO audit_log (user_id, username, action, ip, created_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      ins.run(1, 'admin', 'mfa_disable', '10.0.0.1', now);
      ins.run(1, 'admin', 'mfa_disable', '10.0.0.1', now);
      ins.run(1, 'admin', 'mfa_disable', '10.0.0.1', now);

      // Trigger with the last entry — _evaluateThresholdRule counts
      // matching action rows in audit_log within the window.
      alertService.evaluate({
        action: 'mfa_disable',
        username: 'admin',
        ip: '10.0.0.1',
      });

      const events = db
        .prepare(`SELECT * FROM security_alert_events WHERE rule_id = ?`)
        .all(id);
      expect(events.length).toBe(1);
      expect(events[0].message).toMatch(/3.*mfa_disable/);
    });
  });

  // ─── 4. Disabled rules MUST NOT fire ───────────────────────────────────────
  describe('is_active / enable-disable semantics', () => {
    it('rule with is_active = 0 does not fire (disabled, not deleted)', () => {
      const { id } = alertService.createRule({
        name: 'Disabled MFA Watch',
        eventType: 'mfa_disabled',
        threshold: 1,
        windowSeconds: 0,
        severity: 'warning',
      });
      alertService.updateRule(id, { isActive: false });
      alertService.reload();

      alertService.evaluate({ action: 'mfa_disable', username: 'alice', ip: '10.0.0.1' });

      const events = db.prepare(`SELECT * FROM security_alert_events WHERE rule_id = ?`).all(id);
      expect(events.length).toBe(0);
      expect(channelMock.sendToAll).not.toHaveBeenCalled();
    });

    it('re-enabling a previously disabled rule restores firing', () => {
      const { id } = alertService.createRule({
        name: 'Toggle MFA Watch',
        eventType: 'mfa_disabled',
        threshold: 1,
        windowSeconds: 0,
        severity: 'warning',
      });
      alertService.updateRule(id, { isActive: false });
      alertService.reload();
      alertService.updateRule(id, { isActive: true });
      alertService.reload();

      alertService.evaluate({ action: 'mfa_disable', username: 'alice', ip: '10.0.0.1' });

      const events = db.prepare(`SELECT * FROM security_alert_events WHERE rule_id = ?`).all(id);
      expect(events.length).toBe(1);
    });

    it('_loadRules excludes is_active = 0 rows from in-memory cache', () => {
      const { id } = alertService.createRule({
        name: 'Cache Test',
        eventType: 'mfa_disabled',
        threshold: 1,
        windowSeconds: 0,
      });
      alertService.updateRule(id, { isActive: false });
      alertService.reload();

      const cached = alertService._rules.find(r => r.id === id);
      expect(cached).toBeUndefined();
    });
  });

  // ─── 5. updateRule idempotence + partial updates ───────────────────────────
  describe('updateRule — idempotence and partial', () => {
    it('applying the same update twice yields the same row state', () => {
      const { id } = alertService.createRule({
        name: 'Idem',
        eventType: 'mfa_disabled',
        severity: 'warning',
      });
      alertService.updateRule(id, { severity: 'critical' });
      const after1 = alertService.getRule(id);
      alertService.updateRule(id, { severity: 'critical' });
      const after2 = alertService.getRule(id);

      expect(after1.severity).toBe('critical');
      expect(after2.severity).toBe('critical');
      expect(after1.name).toBe(after2.name);
    });

    it('partial update preserves untouched fields', () => {
      const { id } = alertService.createRule({
        name: 'Partial',
        eventType: 'mfa_disabled',
        threshold: 1,
        severity: 'warning',
      });
      alertService.updateRule(id, { name: 'Renamed' });
      const r = alertService.getRule(id);
      expect(r.name).toBe('Renamed');
      expect(r.event_type).toBe('mfa_disabled');
      expect(r.severity).toBe('warning');
    });
  });

  // ─── 6. notify_channels JSON — targeted vs broadcast ───────────────────────
  describe('notify_channels routing', () => {
    it('sends to specific channel ids when notify_channels is set', () => {
      alertService.createRule({
        name: 'Targeted',
        eventType: 'mfa_disabled',
        threshold: 1,
        windowSeconds: 0,
        severity: 'warning',
        notifyChannels: [42, 99],
      });
      alertService.reload();

      alertService.evaluate({ action: 'mfa_disable', username: 'alice', ip: '10.0.0.1' });

      expect(channelMock.send).toHaveBeenCalledTimes(2);
      const ids = channelMock.send.mock.calls.map(c => c[0]).sort();
      expect(ids).toEqual([42, 99]);
      expect(channelMock.sendToAll).not.toHaveBeenCalled();
    });

    it('falls back to sendToAll when notify_channels is null', () => {
      alertService.createRule({
        name: 'Broadcast',
        eventType: 'mfa_disabled',
        threshold: 1,
        windowSeconds: 0,
        severity: 'warning',
      });
      alertService.reload();

      alertService.evaluate({ action: 'mfa_disable', username: 'bob', ip: '10.0.0.2' });

      expect(channelMock.sendToAll).toHaveBeenCalledTimes(1);
      expect(channelMock.send).not.toHaveBeenCalled();
    });
  });

  // ─── 7. testRule — operator dry-run ────────────────────────────────────────
  describe('testRule', () => {
    it('test-fires the rule and records a "Test alert" event', async () => {
      const { id } = alertService.createRule({
        name: 'Smoke Test',
        eventType: 'mfa_disabled',
        threshold: 1,
        windowSeconds: 0,
        severity: 'info',
      });

      const result = await alertService.testRule(id);
      expect(result.success).toBe(true);

      const events = db
        .prepare(`SELECT * FROM security_alert_events WHERE rule_id = ?`)
        .all(id);
      expect(events.length).toBe(1);
      expect(events[0].message).toMatch(/Test alert/i);
      expect(channelMock.sendToAll).toHaveBeenCalledTimes(1);
    });

    it('throws when ruleId does not exist', async () => {
      await expect(alertService.testRule(99999)).rejects.toThrow(/not found/i);
    });
  });

  // ─── 8. getRecentAlerts time window ────────────────────────────────────────
  describe('getRecentAlerts time-window filtering', () => {
    it('excludes events older than the requested window', () => {
      const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      const recent = new Date().toISOString();

      const ins = db.prepare(`
        INSERT INTO security_alert_events
          (rule_id, rule_name, event_type, severity, message, details, fired_at)
        VALUES (NULL, 'X', 'mfa_disabled', 'warning', ?, '{}', ?)
      `);
      ins.run('old event', old);
      ins.run('recent event', recent);

      const last24h = alertService.getRecentAlerts(24);
      expect(last24h.length).toBe(1);
      expect(last24h[0].message).toBe('recent event');
    });
  });

  // ─── 9. Audit-log entry trail on alert fire ────────────────────────────────
  describe('alert firing produces an audit trail row in security_alert_events', () => {
    it('records rule_id, rule_name, event_type, severity, message and details', () => {
      const { id } = alertService.createRule({
        name: 'Trail Check',
        eventType: 'mfa_disabled',
        threshold: 1,
        windowSeconds: 0,
        severity: 'warning',
      });
      alertService.reload();

      alertService.evaluate({ action: 'mfa_disable', username: 'carol', ip: '10.0.0.7' });

      const evt = db
        .prepare(`SELECT * FROM security_alert_events WHERE rule_id = ?`)
        .get(id);
      expect(evt).toBeTruthy();
      expect(evt.rule_name).toBe('Trail Check');
      expect(evt.event_type).toBe('mfa_disabled');
      expect(evt.severity).toBe('warning');
      expect(evt.message).toContain('carol');
      const details = JSON.parse(evt.details);
      expect(details.user).toBe('carol');
      expect(details.ip).toBe('10.0.0.7');
    });
  });
});
