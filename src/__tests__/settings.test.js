'use strict';

// Tests for src/services/settings.js
// Uses in-memory SQLite via DB_PATH=:memory:

process.env.APP_SECRET = 'test-secret-key-for-jest-tests-only';
process.env.DB_PATH = ':memory:';

jest.resetModules();

describe('SettingsService', () => {
  let db, settings;

  beforeAll(() => {
    const { getDb } = require('../db');
    db = getDb();
    settings = require('../services/settings');
    // Seed a user row so updated_by FK constraint is satisfied
    db.prepare(
      `INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (1, 'admin', 'x', 'admin')`
    ).run();
  });

  afterAll(() => {
    const { closeDb } = require('../db');
    closeDb();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM settings').run();
  });

  // ─── get ───────────────────────────────────────────────────────────────────
  describe('get', () => {
    it('returns null for a missing key by default', () => {
      expect(settings.get('nonexistent')).toBeNull();
    });

    it('returns the provided fallback for a missing key', () => {
      expect(settings.get('missing', 'default-value')).toBe('default-value');
    });

    it('returns the stored value when key exists', () => {
      settings.set('theme', 'dark');
      expect(settings.get('theme')).toBe('dark');
    });

    it('returns updated value after set overwrites', () => {
      settings.set('theme', 'light');
      settings.set('theme', 'dark');
      expect(settings.get('theme')).toBe('dark');
    });
  });

  // ─── getAll ────────────────────────────────────────────────────────────────
  describe('getAll', () => {
    it('returns an empty object when no settings exist', () => {
      expect(settings.getAll()).toEqual({});
    });

    it('returns all key-value pairs as a plain object', () => {
      settings.set('a', '1');
      settings.set('b', '2');
      const all = settings.getAll();
      expect(all).toEqual({ a: '1', b: '2' });
    });

    it('keys are ordered alphabetically', () => {
      settings.set('z', 'last');
      settings.set('a', 'first');
      settings.set('m', 'middle');
      const keys = Object.keys(settings.getAll());
      expect(keys).toEqual(['a', 'm', 'z']);
    });
  });

  // ─── set ───────────────────────────────────────────────────────────────────
  describe('set', () => {
    it('creates a new setting row', () => {
      settings.set('color', 'blue');
      const row = db.prepare('SELECT value FROM settings WHERE key=?').get('color');
      expect(row).toBeTruthy();
      expect(row.value).toBe('blue');
    });

    it('upserts (overwrites) an existing setting', () => {
      settings.set('color', 'blue');
      settings.set('color', 'red');
      const rows = db.prepare('SELECT value FROM settings WHERE key=?').all('color');
      expect(rows.length).toBe(1);
      expect(rows[0].value).toBe('red');
    });

    it('stores userId when provided', () => {
      settings.set('notify', 'true', 1);
      const row = db.prepare('SELECT updated_by FROM settings WHERE key=?').get('notify');
      expect(row.updated_by).toBe(1);
    });

    it('stores null userId when not provided', () => {
      settings.set('feature', 'on');
      const row = db.prepare('SELECT updated_by FROM settings WHERE key=?').get('feature');
      expect(row.updated_by).toBeNull();
    });
  });

  // ─── setBulk ──────────────────────────────────────────────────────────────
  describe('setBulk', () => {
    it('sets multiple keys atomically', () => {
      settings.setBulk({ smtp_host: 'mail.local', smtp_port: '587' });
      expect(settings.get('smtp_host')).toBe('mail.local');
      expect(settings.get('smtp_port')).toBe('587');
    });

    it('coerces numeric values to strings', () => {
      settings.setBulk({ max_items: 100 });
      expect(settings.get('max_items')).toBe('100');
    });

    it('upserts existing keys within the batch', () => {
      settings.set('x', 'old');
      settings.setBulk({ x: 'new', y: 'fresh' });
      expect(settings.get('x')).toBe('new');
      expect(settings.get('y')).toBe('fresh');
    });

    it('handles an empty object without throwing', () => {
      expect(() => settings.setBulk({})).not.toThrow();
    });
  });

  // ─── delete ────────────────────────────────────────────────────────────────
  describe('delete', () => {
    it('removes a setting by key', () => {
      settings.set('temp', 'value');
      settings.delete('temp');
      expect(settings.get('temp')).toBeNull();
    });

    it('does not throw when deleting a non-existent key', () => {
      expect(() => settings.delete('does-not-exist')).not.toThrow();
    });

    it('only removes the targeted key', () => {
      settings.set('keep', 'me');
      settings.set('remove', 'me');
      settings.delete('remove');
      expect(settings.get('keep')).toBe('me');
      expect(settings.get('remove')).toBeNull();
    });
  });
});
