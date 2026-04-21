'use strict';

// Tests for src/services/translations.js (v6.11.0)

process.env.APP_SECRET = 'test-secret-translations';
process.env.APP_ENV = 'test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'TranslationsTest123!';

const { getDb } = require('../db');
getDb();

// Mock global fetch so tests don't hit real APIs
global.fetch = jest.fn();

const translations = require('../services/translations');

beforeEach(() => {
  getDb().prepare('DELETE FROM translations').run();
  getDb().prepare('DELETE FROM translation_usage').run();
  getDb().prepare('DELETE FROM translation_providers').run();
  global.fetch.mockReset();
});

function mockFetchOk(body) {
  global.fetch.mockImplementation(() => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify(body)),
  }));
}

function mockFetchError(status, body) {
  global.fetch.mockImplementation(() => Promise.resolve({
    ok: false, status,
    text: () => Promise.resolve(JSON.stringify(body)),
  }));
}

// ─── Providers CRUD ────────────────────────────────

describe('providers CRUD', () => {
  it('rejects unknown provider', () => {
    expect(() => translations.upsertProvider({ provider: 'azure', apiKey: 'abcdefgh' })).toThrow(/Unknown provider/);
  });

  it('rejects short apiKey', () => {
    expect(() => translations.upsertProvider({ provider: 'google', apiKey: 'x' })).toThrow(/apiKey/);
  });

  it('creates, updates (upsert), deletes', () => {
    const r = translations.upsertProvider({ provider: 'google', apiKey: 'AIzaTestKey123', monthlyLimit: 500000 });
    expect(r.id).toBeGreaterThan(0);
    expect(r.updated).toBe(false);

    const list1 = translations.listProviders();
    expect(list1).toHaveLength(1);
    expect(list1[0].provider).toBe('google');
    expect(list1[0].is_active).toBe(true);

    // Upsert rotates the key without creating a second row
    const r2 = translations.upsertProvider({ provider: 'google', apiKey: 'AIzaRotatedKey456', notes: 'rotated 2026-04-21' });
    expect(r2.id).toBe(r.id);
    expect(r2.updated).toBe(true);

    translations.deleteProvider(r.id);
    expect(translations.listProviders()).toHaveLength(0);
  });

  it('setProviderActive toggles is_active', () => {
    const { id } = translations.upsertProvider({ provider: 'deepl', apiKey: 'deepl-key-xxx' });
    translations.setProviderActive(id, false);
    expect(translations.getProviderByName('deepl').is_active).toBe(false);
    translations.setProviderActive(id, true);
    expect(translations.getProviderByName('deepl').is_active).toBe(true);
  });
});

// ─── Usage ───────────────────────────────────────

describe('usage tracking', () => {
  beforeEach(() => {
    translations.upsertProvider({ provider: 'google', apiKey: 'AIzaTestKey12345' });
    translations.upsertProvider({ provider: 'deepl', apiKey: 'deepl-key-xxx-123' });
  });

  it('starts at zero, increments on translate', async () => {
    expect(translations.getUsage('google')).toBe(0);

    mockFetchOk({ data: { translations: [{ translatedText: 'Salut' }, { translatedText: 'Buna' }] } });
    await translations.translateBatch({ provider: 'google', texts: ['Hello', 'Hi'], targetLang: 'ro' });

    expect(translations.getUsage('google')).toBe(7);  // "Hello" (5) + "Hi" (2)
  });

  it('refuses when quota would be exceeded', async () => {
    const { id } = translations.getProviderByName('google');
    getDb().prepare('UPDATE translation_providers SET monthly_limit = 10 WHERE id = ?').run(id);

    mockFetchOk({ data: { translations: [{ translatedText: 'Salut' }] } });
    await translations.translateBatch({ provider: 'google', texts: ['Hello'], targetLang: 'ro' });  // 5 chars
    expect(translations.getUsage('google')).toBe(5);

    // Next call with 6 more chars would push us to 11 > 10 — should throw
    await expect(
      translations.translateBatch({ provider: 'google', texts: ['Planet'], targetLang: 'ro' })
    ).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });

    // Usage should be unchanged (no charge for a rejected call)
    expect(translations.getUsage('google')).toBe(5);
  });

  it('getAllUsage returns summary for each configured provider', () => {
    const all = translations.getAllUsage();
    expect(all).toHaveLength(2);
    expect(all.map(a => a.provider).sort()).toEqual(['deepl', 'google']);
    expect(all[0].used).toBe(0);
    expect(all[0].percent).toBe(0);
  });
});

// ─── Provider adapters (mocked HTTP) ─────────────

describe('translateBatch — Google', () => {
  beforeEach(() => translations.upsertProvider({ provider: 'google', apiKey: 'AIzaTestKey12345' }));

  it('calls Google v2 endpoint with q array + target + source', async () => {
    mockFetchOk({ data: { translations: [{ translatedText: 'Salut' }, { translatedText: 'Buna' }] } });
    const r = await translations.translateBatch({ provider: 'google', texts: ['Hello', 'Hi'], targetLang: 'ro' });
    expect(r.translated).toEqual(['Salut', 'Buna']);
    expect(r.chars).toBe(7);

    // Verify correct URL + body
    expect(global.fetch).toHaveBeenCalled();
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toContain('translation.googleapis.com/language/translate/v2');
    expect(url).toContain('key=AIzaTestKey12345');
    const body = JSON.parse(opts.body);
    expect(body.q).toEqual(['Hello', 'Hi']);
    expect(body.target).toBe('ro');
    expect(body.source).toBe('en');
  });

  it('surfaces Google API errors', async () => {
    mockFetchError(400, { error: { message: 'Invalid API key' } });
    await expect(
      translations.translateBatch({ provider: 'google', texts: ['x'], targetLang: 'ro' })
    ).rejects.toThrow(/Invalid API key/);
  });
});

describe('translateBatch — DeepL', () => {
  beforeEach(() => translations.upsertProvider({ provider: 'deepl', apiKey: 'deepl-key-xxx-123' }));

  it('calls DeepL free endpoint with auth header + form body', async () => {
    mockFetchOk({ translations: [{ text: 'Salut', detected_source_language: 'EN' }, { text: 'Buna' }] });
    const r = await translations.translateBatch({ provider: 'deepl', texts: ['Hello', 'Hi'], targetLang: 'ro' });
    expect(r.translated).toEqual(['Salut', 'Buna']);

    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api-free.deepl.com/v2/translate');
    expect(opts.headers.Authorization).toBe('DeepL-Auth-Key deepl-key-xxx-123');
    expect(opts.body).toContain('text=Hello');
    expect(opts.body).toContain('text=Hi');
    expect(opts.body).toContain('target_lang=RO');
  });
});

// ─── Translations table CRUD ─────────────────────

describe('translations CRUD', () => {
  it('upsert, list with filter, setStatus, edit', () => {
    translations.upsertTranslation({
      language: 'ro', key: 'common.close', source_text: 'Close',
      translated_text: 'Inchide', provider: 'google', chars_used: 5,
    });
    const list = translations.listTranslations({ language: 'ro' });
    expect(list).toHaveLength(1);
    expect(list[0].status).toBe('pending');

    translations.setTranslationStatus(list[0].id, 'accepted');
    expect(translations.listTranslations({ status: 'accepted' })).toHaveLength(1);

    translations.editTranslation(list[0].id, 'Închide');
    const updated = translations.listTranslations({ language: 'ro' })[0];
    expect(updated.translated_text).toBe('Închide');
    expect(updated.status).toBe('accepted');
  });

  it('upsert over existing key replaces + resets status to pending', () => {
    translations.upsertTranslation({ language: 'ro', key: 'k', source_text: 'x', translated_text: 'y', provider: 'google', chars_used: 1 });
    const first = translations.listTranslations({ language: 'ro' })[0];
    translations.setTranslationStatus(first.id, 'accepted');

    // Re-translate (new suggestion)
    translations.upsertTranslation({ language: 'ro', key: 'k', source_text: 'x', translated_text: 'Z', provider: 'deepl', chars_used: 1 });
    const row = translations.listTranslations({ language: 'ro' })[0];
    expect(row.translated_text).toBe('Z');
    expect(row.status).toBe('pending');
  });

  it('setTranslationStatus rejects invalid status', () => {
    translations.upsertTranslation({ language: 'ro', key: 'k', source_text: 'x', translated_text: 'y', provider: 'google', chars_used: 1 });
    const id = translations.listTranslations({ language: 'ro' })[0].id;
    expect(() => translations.setTranslationStatus(id, 'bogus')).toThrow(/Invalid status/);
  });
});

// ─── Locale parsing ──────────────────────────────

describe('listLanguages / listMissingKeys', () => {
  it('parses en.js + reports coverage for other langs', () => {
    const langs = translations.listLanguages();
    expect(langs.length).toBeGreaterThan(5);
    const en = langs.find(l => l.lang === 'en');
    expect(en).toBeTruthy();
    expect(en.coverage).toBe(100);
    // Other langs should report SOME coverage (even if partial)
    const other = langs.find(l => l.lang !== 'en' && !l.error);
    if (other) {
      expect(other.coverage).toBeGreaterThanOrEqual(0);
      expect(other.coverage).toBeLessThanOrEqual(100);
    }
  });

  it('listMissingKeys returns an array with source_text for each gap', () => {
    const missing = translations.listMissingKeys('ro');
    expect(Array.isArray(missing)).toBe(true);
    if (missing.length > 0) {
      expect(missing[0]).toHaveProperty('key');
      expect(missing[0]).toHaveProperty('source_text');
    }
  });
});

// ─── Internals ───────────────────────────────────

describe('flatten/unflatten round-trip', () => {
  const { _flatten, _unflatten } = translations._internals;

  it('flatten collects leaves into dot-keys', () => {
    const flat = _flatten({ a: { b: { c: 1, d: 2 } }, e: 3 });
    expect(flat).toEqual({ 'a.b.c': 1, 'a.b.d': 2, e: 3 });
  });

  it('unflatten rebuilds nested object', () => {
    const tree = _unflatten({ 'a.b.c': 1, 'a.b.d': 2, e: 3 });
    expect(tree).toEqual({ a: { b: { c: 1, d: 2 } }, e: 3 });
  });
});
