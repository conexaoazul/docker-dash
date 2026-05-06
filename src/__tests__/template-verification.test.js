'use strict';

// WHY: Closing self-introduced test debt from the v8.2.x post-audit
// remediation pass.
//
// Two surfaces shipped in v8.2.x without coverage:
//   1. Migration 065 — adds `verified_at` + `deprecated_in_favor_of`
//      columns to `custom_templates`. Idempotent guard via PRAGMA so a
//      second run is a no-op. If the guard breaks, every redeploy
//      explodes on `ALTER TABLE ... duplicate column`.
//   2. The BUILTIN_VERIFICATION map in routes/templates.js — the
//      v8.3.0-prep "is this template still maintained?" trust signal.
//      Entries are added/removed manually as the maintainer re-validates
//      images. If `getMergedTemplates()` stops surfacing those flags,
//      the UI silently regresses to the unsigned-list state.
//
// This suite locks down both: column shape on custom_templates and the
// merged-shape contract for built-ins / customs / overrides.

process.env.APP_SECRET = 'test-secret-key-for-jest-tests-only';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';

const Database = require('better-sqlite3');
const migration065 = require('../db/migrations/065_template_verified');

describe('Migration 065 — template verified_at columns', () => {
  let db;

  beforeEach(() => {
    // Fresh in-memory DB with the minimum schema migration 065 needs:
    // a `custom_templates` table at its pre-065 shape.
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE custom_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Custom',
        icon TEXT NOT NULL DEFAULT 'fas fa-cube',
        description TEXT NOT NULL DEFAULT '',
        compose TEXT NOT NULL,
        is_builtin_override INTEGER NOT NULL DEFAULT 0,
        created_by TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_by TEXT,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  });

  afterEach(() => {
    if (db) db.close();
  });

  it('adds verified_at column to custom_templates', () => {
    migration065.up(db);
    const cols = db.pragma('table_info(custom_templates)');
    const verified = cols.find((c) => c.name === 'verified_at');
    expect(verified).toBeTruthy();
    expect(verified.type).toBe('TEXT');
  });

  it('adds deprecated_in_favor_of column to custom_templates', () => {
    migration065.up(db);
    const cols = db.pragma('table_info(custom_templates)');
    const deprecated = cols.find((c) => c.name === 'deprecated_in_favor_of');
    expect(deprecated).toBeTruthy();
    expect(deprecated.type).toBe('TEXT');
  });

  it('is idempotent — running twice does not error or duplicate columns', () => {
    migration065.up(db);
    expect(() => migration065.up(db)).not.toThrow();

    const cols = db.pragma('table_info(custom_templates)');
    const verifiedCount = cols.filter((c) => c.name === 'verified_at').length;
    const deprecatedCount = cols.filter((c) => c.name === 'deprecated_in_favor_of').length;
    expect(verifiedCount).toBe(1);
    expect(deprecatedCount).toBe(1);
  });

  it('new columns default to NULL when no value is provided', () => {
    migration065.up(db);
    db.prepare(
      `INSERT INTO custom_templates (id, name, compose) VALUES ('t1', 'Test One', 'services: {}')`
    ).run();
    const row = db.prepare('SELECT * FROM custom_templates WHERE id = ?').get('t1');
    expect(row.verified_at).toBeNull();
    expect(row.deprecated_in_favor_of).toBeNull();
  });
});

describe('BUILTIN_VERIFICATION map + getMergedTemplates() contract', () => {
  let db;
  let templatesRoute;

  beforeAll(() => {
    // Use the real `getDb()` singleton so getMergedTemplates() works
    // unmodified. This auto-runs all migrations against an in-memory
    // DB (DB_PATH=':memory:' from the env above).
    const { getDb } = require('../db');
    db = getDb();
    db.pragma('foreign_keys = OFF');
    templatesRoute = require('../routes/templates');
  });

  afterAll(() => {
    const { closeDb } = require('../db');
    closeDb();
  });

  beforeEach(() => {
    db.prepare('DELETE FROM custom_templates').run();
  });

  it('BUILTIN_VERIFICATION is a non-empty plain object exported from templates.js', () => {
    expect(typeof templatesRoute.BUILTIN_VERIFICATION).toBe('object');
    expect(templatesRoute.BUILTIN_VERIFICATION).not.toBeNull();
    expect(Array.isArray(templatesRoute.BUILTIN_VERIFICATION)).toBe(false);
  });

  it('BUILTIN_VERIFICATION has at least the 14 documented entries', () => {
    // The v8.2.0 release sweep verified 14 templates: 2 registry +
    // 12 AI workloads. The exact list may grow over time but must
    // never shrink below 14 without an explicit downgrade decision.
    const ids = Object.keys(templatesRoute.BUILTIN_VERIFICATION);
    expect(ids.length).toBeGreaterThanOrEqual(14);

    // And the documented anchor IDs must be present.
    const anchors = [
      'private-registry',
      'private-registry-with-cache',
      'ai-ollama',
      'ai-ollama-openwebui',
      'ai-rag-stack',
      'ai-vllm',
      'ai-stable-diffusion',
      'ai-comfyui',
      'ai-whisper',
      'ai-langflow',
      'ai-anything-llm',
      'ai-n8n',
      'ai-litellm',
      'ai-flowise',
    ];
    for (const a of anchors) {
      expect(templatesRoute.BUILTIN_VERIFICATION[a]).toBeTruthy();
      expect(templatesRoute.BUILTIN_VERIFICATION[a].verified_at).toMatch(
        /^\d{4}-\d{2}-\d{2}/
      );
    }
  });

  it('getMergedTemplates exposes verified_at on a built-in IN the verification map (ai-ollama)', () => {
    const merged = templatesRoute.getMergedTemplates();
    const ollama = merged.find((t) => t.id === 'ai-ollama');
    expect(ollama).toBeTruthy();
    expect(ollama.verified_at).toBeTruthy();
    expect(ollama.verified_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(ollama.deprecated_in_favor_of).toBeNull();
  });

  it('getMergedTemplates exposes verified_at: null on a built-in NOT in the verification map', () => {
    // `nginx` is in TEMPLATES but NOT in BUILTIN_VERIFICATION (per the
    // "older built-ins, not re-verified yet" comment). It must surface
    // verified_at: null so the UI can show a neutral state.
    const merged = templatesRoute.getMergedTemplates();
    const nginx = merged.find((t) => t.id === 'nginx');
    expect(nginx).toBeTruthy();
    expect(nginx.isBuiltin).toBe(true);
    expect(nginx.verified_at).toBeNull();
  });

  it('getMergedTemplates exposes deprecated_in_favor_of: null on built-ins by default', () => {
    const merged = templatesRoute.getMergedTemplates();
    const builtins = merged.filter((t) => t.isBuiltin);
    expect(builtins.length).toBeGreaterThan(0);
    for (const t of builtins) {
      // No built-in has been deprecated yet — every entry must be null.
      expect(t.deprecated_in_favor_of).toBeNull();
    }
  });

  it('getMergedTemplates reads verified_at from the custom_templates row', () => {
    db.prepare(
      `INSERT INTO custom_templates
         (id, name, compose, verified_at, deprecated_in_favor_of)
       VALUES (?, ?, ?, ?, ?)`
    ).run('my-custom-1', 'My Custom', 'services: {}', '2026-04-01', null);

    const merged = templatesRoute.getMergedTemplates();
    const c = merged.find((t) => t.id === 'my-custom-1');
    expect(c).toBeTruthy();
    expect(c.verified_at).toBe('2026-04-01');
    expect(c.deprecated_in_favor_of).toBeNull();
  });

  it('getMergedTemplates reads deprecated_in_favor_of from the custom_templates row', () => {
    db.prepare(
      `INSERT INTO custom_templates
         (id, name, compose, verified_at, deprecated_in_favor_of)
       VALUES (?, ?, ?, ?, ?)`
    ).run('my-custom-2', 'Old Custom', 'services: {}', null, 'newer-template-id');

    const merged = templatesRoute.getMergedTemplates();
    const c = merged.find((t) => t.id === 'my-custom-2');
    expect(c).toBeTruthy();
    expect(c.deprecated_in_favor_of).toBe('newer-template-id');
    expect(c.verified_at).toBeNull();
  });

  it('getMergedTemplates returns null verified_at + deprecated_in_favor_of on a custom_templates row with no values set', () => {
    db.prepare(
      `INSERT INTO custom_templates (id, name, compose)
       VALUES (?, ?, ?)`
    ).run('my-custom-3', 'Bare Custom', 'services: {}');

    const merged = templatesRoute.getMergedTemplates();
    const c = merged.find((t) => t.id === 'my-custom-3');
    expect(c).toBeTruthy();
    expect(c.verified_at).toBeNull();
    expect(c.deprecated_in_favor_of).toBeNull();
  });
});
