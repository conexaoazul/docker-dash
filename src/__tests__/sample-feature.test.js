'use strict';

// Tests for src/services/sample-feature.js (v7.4.0 — CONTRIBUTOR DEMO)
//
// Mirrors the existing test pattern in update-check.test.js. If you're
// writing a test for your own contribution, copy-paste this file as a
// starting point.

process.env.APP_SECRET = 'test-secret-key-for-jest-tests-only';
process.env.DB_PATH = ':memory:';

jest.resetModules();

describe('sample-feature service', () => {
  let db, sampleFeature;

  beforeAll(() => {
    const { getDb } = require('../db');
    db = getDb();
    sampleFeature = require('../services/sample-feature');
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
    sampleFeature.setWsBroadcaster(null);  // detach for these tests
  });

  describe('getCount', () => {
    it('returns 0 when nothing is stored', () => {
      expect(sampleFeature.getCount()).toBe(0);
    });

    it('returns the stored value', () => {
      const settings = require('../services/settings');
      settings.set(sampleFeature._internals.SETTING_KEY, '42');
      expect(sampleFeature.getCount()).toBe(42);
    });

    it('tolerates non-numeric stored values (returns 0)', () => {
      const settings = require('../services/settings');
      settings.set(sampleFeature._internals.SETTING_KEY, 'not a number');
      expect(sampleFeature.getCount()).toBe(0);
    });
  });

  describe('increment', () => {
    it('increases the counter by 1 from 0', () => {
      const result = sampleFeature.increment();
      expect(result.count).toBe(1);
      expect(sampleFeature.getCount()).toBe(1);
    });

    it('persists across calls', () => {
      sampleFeature.increment();
      sampleFeature.increment();
      sampleFeature.increment();
      expect(sampleFeature.getCount()).toBe(3);
    });

    it('defaults source to "manual"', () => {
      expect(sampleFeature.increment().source).toBe('manual');
    });

    it('respects an explicit source label', () => {
      expect(sampleFeature.increment({ source: 'cron' }).source).toBe('cron');
    });

    it('broadcasts via the WS hook when wired', () => {
      const calls = [];
      sampleFeature.setWsBroadcaster((type, data, channel) => calls.push({ type, data, channel }));
      sampleFeature.increment({ source: 'manual' });
      expect(calls).toEqual([{
        type: 'sample-feature:counter',
        data: { count: 1, source: 'manual' },
        channel: 'sample-feature:counter',
      }]);
    });

    it('does not throw when no broadcaster is wired', () => {
      // Default state — broadcaster is null. Should still increment.
      expect(() => sampleFeature.increment()).not.toThrow();
      expect(sampleFeature.getCount()).toBe(1);
    });

    it('survives a throwing broadcaster (logs warn, doesn\'t bubble)', () => {
      sampleFeature.setWsBroadcaster(() => { throw new Error('boom'); });
      expect(() => sampleFeature.increment()).not.toThrow();
      expect(sampleFeature.getCount()).toBe(1);
    });
  });

  describe('reset', () => {
    it('returns 0 + zeroes the stored value', () => {
      sampleFeature.increment();
      sampleFeature.increment();
      sampleFeature.increment();
      const result = sampleFeature.reset();
      expect(result.count).toBe(0);
      expect(sampleFeature.getCount()).toBe(0);
      expect(result.source).toBe('reset');
    });

    it('broadcasts the reset via WS', () => {
      const calls = [];
      sampleFeature.setWsBroadcaster((type, data) => calls.push({ type, data }));
      sampleFeature.reset();
      expect(calls).toEqual([{
        type: 'sample-feature:counter',
        data: { count: 0, source: 'reset' },
      }]);
    });
  });

  describe('tick', () => {
    it('increments with source="cron" (this is what the cron job calls)', () => {
      const result = sampleFeature.tick();
      expect(result.count).toBe(1);
      expect(result.source).toBe('cron');
    });
  });
});
