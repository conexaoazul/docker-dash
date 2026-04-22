'use strict';

// Tests for src/services/securityAlerts.js
// Uses in-memory SQLite via DB_PATH=:memory:
// Mocks notificationChannels to avoid real network I/O.

process.env.APP_SECRET = 'test-secret-key-for-jest-tests-only';
process.env.DB_PATH = ':memory:';

jest.resetModules();

// Mock notificationChannels before any require so the service picks it up
jest.mock('../services/notificationChannels', () => ({
  send: jest.fn().mockResolvedValue(undefined),
  sendToAll: jest.fn().mockResolvedValue(undefined),
}));

describe('SecurityAlertService', () => {
  let db, alertService, channelMock;

  beforeAll(() => {
    const { getDb } = require('../db');
    db = getDb();
    alertService = require('../services/securityAlerts');
    channelMock = require('../services/notificationChannels');

    // Seed required user row (FK for created_by in rules if needed)
    db.prepare(
      `INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'admin', 'x', 'admin')`
    ).run();

    // Initialize after DB is ready
    alertService.init();
  });

  afterAll(() => {
    const { closeDb } = require('../db');
    closeDb();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Delete events first (FK references security_alert_rules)
    db.prepare('DELETE FROM security_alert_events').run();
    db.prepare('DELETE FROM security_alert_rules').run();
    alertService._rules = [];
    alertService._cooldowns.clear();
  });

  // ─── _mapActionToEvent ─────────────────────────────────────────────────────
  describe('_mapActionToEvent (private via evaluate)', () => {
    it('maps mfa_disable → mfa_disabled', () => {
      const result = alertService._mapActionToEvent({ action: 'mfa_disable', details: null });
      expect(result).toBe('mfa_disabled');
    });

    it('maps reset_password → admin_password_reset', () => {
      const result = alertService._mapActionToEvent({ action: 'reset_password', details: null });
      expect(result).toBe('admin_password_reset');
    });

    it('maps send_password_reset → admin_password_reset', () => {
      const result = alertService._mapActionToEvent({ action: 'send_password_reset', details: null });
      expect(result).toBe('admin_password_reset');
    });

    it('successful login maps to null (no alert)', () => {
      const result = alertService._mapActionToEvent({ action: 'login', details: null });
      expect(result).toBeNull();
    });

    it('create_user with role=admin maps to create_admin_user', () => {
      const result = alertService._mapActionToEvent({
        action: 'create_user',
        details: JSON.stringify({ role: 'admin' }),
      });
      expect(result).toBe('create_admin_user');
    });

    it('create_user with role=viewer maps to null', () => {
      const result = alertService._mapActionToEvent({
        action: 'create_user',
        details: JSON.stringify({ role: 'viewer' }),
      });
      expect(result).toBeNull();
    });

    it('update_user with role=admin maps to role_changed_to_admin', () => {
      const result = alertService._mapActionToEvent({
        action: 'update_user',
        details: JSON.stringify({ role: 'admin' }),
      });
      expect(result).toBe('role_changed_to_admin');
    });

    it('unknown action maps to null', () => {
      const result = alertService._mapActionToEvent({ action: 'container:stop', details: null });
      expect(result).toBeNull();
    });
  });

  // ─── Rule CRUD ─────────────────────────────────────────────────────────────
  describe('createRule / getRule / listRules / deleteRule', () => {
    it('creates a rule and retrieves it by id', () => {
      const { id } = alertService.createRule({
        name: 'Test MFA',
        eventType: 'mfa_disabled',
        threshold: 1,
        windowSeconds: 0,
        severity: 'warning',
      });
      expect(id).toBeGreaterThan(0);

      const rule = alertService.getRule(id);
      expect(rule).toBeTruthy();
      expect(rule.name).toBe('Test MFA');
      expect(rule.event_type).toBe('mfa_disabled');
    });

    it('listRules returns all rules ordered by name', () => {
      alertService.createRule({ name: 'B Rule', eventType: 'mfa_disabled' });
      alertService.createRule({ name: 'A Rule', eventType: 'mfa_disabled' });
      const rules = alertService.listRules();
      const names = rules.map(r => r.name);
      expect(names).toEqual([...names].sort());
    });

    it('createRule throws when name or eventType is missing', () => {
      expect(() => alertService.createRule({ name: '', eventType: 'mfa_disabled' })).toThrow();
      expect(() => alertService.createRule({ name: 'X', eventType: '' })).toThrow();
    });

    it('deleteRule removes the rule', () => {
      const { id } = alertService.createRule({ name: 'Temp', eventType: 'mfa_disabled' });
      alertService.deleteRule(id);
      expect(alertService.getRule(id)).toBeUndefined();
    });

    it('getRule returns undefined for nonexistent id', () => {
      expect(alertService.getRule(99999)).toBeUndefined();
    });
  });

  // ─── updateRule ────────────────────────────────────────────────────────────
  describe('updateRule', () => {
    it('updates name, severity and isActive fields', () => {
      const { id } = alertService.createRule({ name: 'Old Name', eventType: 'mfa_disabled', severity: 'warning' });
      alertService.updateRule(id, { name: 'New Name', severity: 'critical', isActive: false });
      const rule = alertService.getRule(id);
      expect(rule.name).toBe('New Name');
      expect(rule.severity).toBe('critical');
      expect(rule.is_active).toBe(0);
    });

    it('is a no-op when no fields are given', () => {
      const { id } = alertService.createRule({ name: 'Stable', eventType: 'mfa_disabled' });
      expect(() => alertService.updateRule(id, {})).not.toThrow();
      expect(alertService.getRule(id).name).toBe('Stable');
    });
  });

  // ─── evaluate — instant rule fires alert ──────────────────────────────────
  describe('evaluate — instant rule (threshold=1)', () => {
    it('fires and records an event when action matches', () => {
      alertService.createRule({
        name: 'MFA Alert',
        eventType: 'mfa_disabled',
        threshold: 1,
        windowSeconds: 0,
        severity: 'critical',
      });
      alertService.reload();

      alertService.evaluate({
        action: 'mfa_disable',
        username: 'alice',
        ip: '10.0.0.1',
      });

      const events = db.prepare('SELECT * FROM security_alert_events').all();
      expect(events.length).toBe(1);
      expect(events[0].event_type).toBe('mfa_disabled');
      expect(events[0].severity).toBe('critical');
    });

    it('sends notification to channels on alert fire', () => {
      alertService.createRule({
        name: 'Admin Created',
        eventType: 'create_admin_user',
        threshold: 1,
        windowSeconds: 0,
        severity: 'warning',
      });
      alertService.reload();

      alertService.evaluate({
        action: 'create_user',
        details: JSON.stringify({ role: 'admin' }),
        username: 'bob',
        ip: '192.168.1.1',
      });

      expect(channelMock.sendToAll).toHaveBeenCalledTimes(1);
      const notif = channelMock.sendToAll.mock.calls[0][0];
      expect(notif.event).toBe('security_alert');
      expect(notif.severity).toBe('warning');
    });

    it('cooldown prevents duplicate firing within 1 minute', () => {
      alertService.createRule({
        name: 'Cooldown Test',
        eventType: 'admin_password_reset',
        threshold: 1,
        windowSeconds: 0,
        severity: 'info',
      });
      alertService.reload();

      const entry = { action: 'reset_password', username: 'admin', ip: '127.0.0.1' };
      alertService.evaluate(entry);
      alertService.evaluate(entry); // should be suppressed by cooldown

      const events = db.prepare('SELECT * FROM security_alert_events WHERE event_type=?').all('admin_password_reset');
      expect(events.length).toBe(1);
    });

    it('does not fire for non-matching event type', () => {
      alertService.createRule({
        name: 'Only MFA',
        eventType: 'mfa_disabled',
        threshold: 1,
        windowSeconds: 0,
        severity: 'warning',
      });
      alertService.reload();

      alertService.evaluate({ action: 'create_user', details: '{"role":"viewer"}', username: 'x', ip: '1.2.3.4' });

      const events = db.prepare('SELECT * FROM security_alert_events').all();
      expect(events.length).toBe(0);
    });

    it('skips unmapped actions silently', () => {
      alertService.evaluate({ action: 'logout', username: 'x', ip: '1.2.3.4' });
      expect(channelMock.sendToAll).not.toHaveBeenCalled();
    });
  });

  // ─── getRecentAlerts ──────────────────────────────────────────────────────
  describe('getRecentAlerts', () => {
    it('returns empty array when no events exist', () => {
      const alerts = alertService.getRecentAlerts(24);
      expect(Array.isArray(alerts)).toBe(true);
      expect(alerts.length).toBe(0);
    });

    it('returns recorded alerts within the time window', () => {
      // Insert with ISO 8601 format (with T) so the string comparison in getRecentAlerts works
      const firedAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO security_alert_events (rule_id, rule_name, event_type, severity, message, details, fired_at)
        VALUES (NULL, 'Direct Test Rule', 'mfa_disabled', 'warning', 'direct test', '{}', ?)
      `).run(firedAt);

      const alerts = alertService.getRecentAlerts(1);
      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts[0].event_type).toBe('mfa_disabled');
    });
  });

  // ─── _buildMessage ────────────────────────────────────────────────────────
  describe('_buildMessage', () => {
    it('builds message for create_admin_user', () => {
      const msg = alertService._buildMessage(
        { event_type: 'create_admin_user' },
        { username: 'alice', ip: '10.0.0.1' }
      );
      expect(msg).toContain('alice');
      expect(msg).toContain('10.0.0.1');
    });

    it('builds message for mfa_disabled', () => {
      const msg = alertService._buildMessage(
        { event_type: 'mfa_disabled' },
        { username: 'bob', ip: '192.168.1.1' }
      );
      expect(msg).toContain('bob');
    });

    it('builds generic message for unrecognized event type', () => {
      const msg = alertService._buildMessage(
        { event_type: 'custom_event' },
        { username: 'charlie', ip: '1.1.1.1' }
      );
      expect(msg).toContain('custom_event');
      expect(msg).toContain('charlie');
    });

    it('uses "unknown" when username/ip are absent', () => {
      const msg = alertService._buildMessage({ event_type: 'mfa_disabled' }, {});
      expect(msg).toContain('unknown');
    });
  });
});
