'use strict';

// Translations service — v6.11.0
//
// Wraps Google Translate + DeepL free-tier APIs with per-month usage tracking.
// Free tier limits: 500k chars/month each (both services). We refuse to call
// the API when the incremented char count would exceed the limit — admin must
// wait for the 1st of next month OR bump the monthly_limit in provider config.
//
// Per-key translations are cached in the DB with a review workflow (pending →
// accepted / rejected → applied). The "applied" status is set after an admin
// exports the locale file and (implicitly) commits it to git.
//
// Security: provider API keys are AES-GCM encrypted at rest (same crypto util
// as notification_channels + acme_credentials). Outbound HTTP uses Node fetch
// with a 10s timeout. No secrets are ever logged.

const fs = require('fs');
const path = require('path');
const log = require('../utils/logger')('translations');
const { getDb } = require('../db');
const { encrypt, decrypt } = require('../utils/crypto');

// ─── Providers: CRUD ──────────────────────────────────

function listProviders() {
  return getDb().prepare(`
    SELECT id, provider, monthly_limit, is_active, notes, created_at, updated_at
    FROM translation_providers ORDER BY provider ASC
  `).all().map((r) => ({ ...r, is_active: r.is_active === 1 }));
}

function getProvider(id) {
  const row = getDb().prepare('SELECT * FROM translation_providers WHERE id = ?').get(id);
  if (!row) return null;
  return { ...row, is_active: row.is_active === 1 };
}

function getProviderByName(provider) {
  const row = getDb().prepare('SELECT * FROM translation_providers WHERE provider = ?').get(provider);
  if (!row) return null;
  return { ...row, is_active: row.is_active === 1 };
}

function _getApiKey(providerName) {
  const row = getProviderByName(providerName);
  if (!row) throw new Error(`Provider "${providerName}" not configured`);
  if (!row.is_active) throw new Error(`Provider "${providerName}" is disabled`);
  return { apiKey: decrypt(row.api_key_encrypted), monthlyLimit: row.monthly_limit };
}

function upsertProvider({ provider, apiKey, monthlyLimit = 500000, notes = '' }) {
  if (!['google', 'deepl'].includes(provider)) {
    throw new Error(`Unknown provider: ${provider}. Supported: google, deepl`);
  }
  if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 8) {
    throw new Error('apiKey required (min 8 chars)');
  }
  const db = getDb();
  const existing = getProviderByName(provider);
  const enc = encrypt(apiKey);
  if (existing) {
    db.prepare(`
      UPDATE translation_providers
      SET api_key_encrypted = ?, monthly_limit = ?, notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(enc, monthlyLimit, notes || null, existing.id);
    return { id: existing.id, updated: true };
  }
  const res = db.prepare(`
    INSERT INTO translation_providers (provider, api_key_encrypted, monthly_limit, notes)
    VALUES (?, ?, ?, ?)
  `).run(provider, enc, monthlyLimit, notes || null);
  return { id: res.lastInsertRowid, updated: false };
}

function setProviderActive(id, isActive) {
  getDb().prepare(`
    UPDATE translation_providers SET is_active = ?, updated_at = datetime('now') WHERE id = ?
  `).run(isActive ? 1 : 0, id);
}

function deleteProvider(id) {
  getDb().prepare('DELETE FROM translation_providers WHERE id = ?').run(id);
}

// ─── Usage tracking ───────────────────────────────────

function _yearMonth(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function getUsage(provider, yearMonth = _yearMonth()) {
  const row = getDb().prepare(`
    SELECT chars_used FROM translation_usage
    WHERE provider = ? AND year_month = ?
  `).get(provider, yearMonth);
  return row ? row.chars_used : 0;
}

function getAllUsage(yearMonth = _yearMonth()) {
  const providers = listProviders();
  return providers.map((p) => {
    const used = getUsage(p.provider, yearMonth);
    const pct = p.monthly_limit > 0 ? Math.round((used / p.monthly_limit) * 100) : 0;
    return {
      provider: p.provider,
      yearMonth,
      used,
      limit: p.monthly_limit,
      remaining: Math.max(0, p.monthly_limit - used),
      percent: pct,
      isActive: p.is_active,
    };
  });
}

function _recordUsage(provider, chars) {
  const ym = _yearMonth();
  const db = getDb();
  db.prepare(`
    INSERT INTO translation_usage (provider, year_month, chars_used)
    VALUES (?, ?, ?)
    ON CONFLICT(provider, year_month) DO UPDATE SET
      chars_used = chars_used + excluded.chars_used,
      updated_at = datetime('now')
  `).run(provider, ym, chars);
}

// ─── Provider adapters (HTTP) ────────────────────────

async function _fetchJson(url, opts = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    const text = await res.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
    if (!res.ok) {
      const msg = body?.error?.message || body?.message || body?.raw || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(t);
  }
}

// Google Cloud Translation API v2 — simple key-auth variant
async function _translateGoogle(apiKey, texts, targetLang, sourceLang = 'en') {
  // v2 accepts q as array (repeated). 128 texts max per call, 5k chars per text.
  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`;
  const body = await _fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts, target: targetLang.toLowerCase(), source: sourceLang.toLowerCase(), format: 'text' }),
  });
  const results = body?.data?.translations || [];
  return results.map((r) => r.translatedText);
}

async function _testGoogle(apiKey) {
  // Cheap auth test: list supported languages. Fails fast on bad key.
  const url = `https://translation.googleapis.com/language/translate/v2/languages?key=${encodeURIComponent(apiKey)}`;
  await _fetchJson(url, { method: 'GET' });
  return { ok: true };
}

// DeepL API Free — api-free.deepl.com
async function _translateDeepL(apiKey, texts, targetLang, sourceLang = 'EN') {
  // DeepL accepts text[] as repeated form fields. Keep under 128KB / 50 texts per call.
  // Uses form-encoded body — we'll just use URLSearchParams.
  const params = new URLSearchParams();
  for (const t of texts) params.append('text', t);
  params.append('target_lang', targetLang.toUpperCase());
  params.append('source_lang', sourceLang.toUpperCase());
  const body = await _fetchJson('https://api-free.deepl.com/v2/translate', {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  return (body?.translations || []).map((r) => r.text);
}

async function _testDeepL(apiKey) {
  // /usage returns current month quota — also validates the key.
  const body = await _fetchJson('https://api-free.deepl.com/v2/usage', {
    method: 'GET',
    headers: { 'Authorization': `DeepL-Auth-Key ${apiKey}` },
  });
  return { ok: true, remote: body };
}

async function testProvider(provider) {
  const { apiKey } = _getApiKey(provider);
  if (provider === 'google') return _testGoogle(apiKey);
  if (provider === 'deepl') return _testDeepL(apiKey);
  throw new Error(`Unknown provider: ${provider}`);
}

// ─── Translate with quota check + usage record ──────

async function translateBatch({ provider, texts, targetLang, sourceLang = 'en' }) {
  if (!Array.isArray(texts) || texts.length === 0) throw new Error('texts required (non-empty array)');
  const chars = texts.reduce((s, t) => s + (t || '').length, 0);
  if (chars === 0) throw new Error('All texts are empty');

  const { apiKey, monthlyLimit } = _getApiKey(provider);
  const used = getUsage(provider);
  if (used + chars > monthlyLimit) {
    const err = new Error(`Quota would exceed: ${used} + ${chars} > ${monthlyLimit} for ${provider} this month. Translate smaller batch or wait until next month.`);
    err.code = 'QUOTA_EXCEEDED';
    err.used = used;
    err.requested = chars;
    err.limit = monthlyLimit;
    throw err;
  }

  let translated;
  if (provider === 'google') translated = await _translateGoogle(apiKey, texts, targetLang, sourceLang);
  else if (provider === 'deepl') translated = await _translateDeepL(apiKey, texts, targetLang, sourceLang);
  else throw new Error(`Unknown provider: ${provider}`);

  if (translated.length !== texts.length) {
    log.warn('Provider returned mismatched batch size', { provider, expected: texts.length, got: translated.length });
  }

  _recordUsage(provider, chars);
  log.info('Translated batch', { provider, targetLang, count: texts.length, chars });
  return { translated, chars, provider };
}

// ─── Locale file parsing (flatten nested key structure) ──

const I18N_DIR = path.join(__dirname, '..', '..', 'public', 'js', 'i18n');

function _loadLocaleTree(lang) {
  // Files register via `i18n.register(code, flag, name, tree)`. We need the
  // `tree` object — 4th arg. Parse the file by requiring it in a sandbox that
  // captures the register call.
  const filePath = path.join(I18N_DIR, `${lang}.js`);
  if (!fs.existsSync(filePath)) throw new Error(`Locale file not found: ${lang}.js`);
  const content = fs.readFileSync(filePath, 'utf8');
  // Synthesize a tiny sandbox so we can exec the file
  let captured = null;
  const sandbox = { i18n: { register: (_code, _flag, _name, tree) => { captured = tree; } } };
  // eslint-disable-next-line no-new-func
  new Function('i18n', content)(sandbox.i18n);
  if (!captured || typeof captured !== 'object') throw new Error(`Locale file ${lang}.js did not register a translation tree`);
  return captured;
}

function _flatten(obj, prefix = '') {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(out, _flatten(v, key));
    else out[key] = v;
  }
  return out;
}

function _listLocales() {
  const files = fs.readdirSync(I18N_DIR).filter((f) => f.endsWith('.js') && f !== 'TEMPLATE.js');
  return files.map((f) => f.replace(/\.js$/, ''));
}

function listLanguages() {
  const langs = _listLocales();
  const en = _flatten(_loadLocaleTree('en'));
  const enKeyCount = Object.keys(en).length;
  return langs.map((lang) => {
    if (lang === 'en') return { lang, keys: enKeyCount, missing: 0, coverage: 100 };
    try {
      const tree = _flatten(_loadLocaleTree(lang));
      const present = Object.keys(tree).filter((k) => en[k] !== undefined).length;
      const missing = Object.keys(en).filter((k) => tree[k] === undefined || tree[k] === en[k]).length;
      return { lang, keys: present, missing, coverage: enKeyCount > 0 ? Math.round((present / enKeyCount) * 100) : 0 };
    } catch (e) {
      return { lang, error: e.message, keys: 0, missing: enKeyCount, coverage: 0 };
    }
  });
}

function listMissingKeys(lang) {
  if (lang === 'en') return [];
  const en = _flatten(_loadLocaleTree('en'));
  let target = {};
  try { target = _flatten(_loadLocaleTree(lang)); } catch { /* fresh language */ }
  const missing = [];
  for (const [k, v] of Object.entries(en)) {
    if (typeof v !== 'string') continue;  // skip non-string values (arrays)
    if (target[k] === undefined || target[k] === v) {  // missing OR placeholder EN fallback
      // Check if we already have a translation in DB for this (any status except rejected)
      const cached = getDb().prepare(
        `SELECT translated_text, status FROM translations WHERE language = ? AND key = ? AND status != 'rejected'`
      ).get(lang, k);
      missing.push({ key: k, source_text: v, cached: cached || null });
    }
  }
  return missing;
}

// ─── Translations table CRUD ─────────────────────────

function upsertTranslation({ language, key, source_text, translated_text, provider, chars_used }) {
  getDb().prepare(`
    INSERT INTO translations (language, key, source_text, translated_text, provider, chars_used)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(language, key) DO UPDATE SET
      translated_text = excluded.translated_text,
      source_text = excluded.source_text,
      provider = excluded.provider,
      chars_used = excluded.chars_used,
      status = 'pending',
      updated_at = datetime('now')
  `).run(language, key, source_text, translated_text, provider, chars_used);
}

function listTranslations({ language, status } = {}) {
  const where = [];
  const args = [];
  if (language) { where.push('language = ?'); args.push(language); }
  if (status) { where.push('status = ?'); args.push(status); }
  const sql = `SELECT * FROM translations ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY language, key LIMIT 5000`;
  return getDb().prepare(sql).all(...args);
}

function setTranslationStatus(id, status) {
  if (!['pending', 'accepted', 'rejected', 'applied'].includes(status)) throw new Error(`Invalid status: ${status}`);
  getDb().prepare(`UPDATE translations SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
}

function editTranslation(id, newText) {
  if (!newText || typeof newText !== 'string') throw new Error('translated_text required');
  getDb().prepare(`
    UPDATE translations SET translated_text = ?, status = 'accepted', updated_at = datetime('now')
    WHERE id = ?
  `).run(newText, id);
}

// ─── Export: merge accepted translations into a locale tree ──

function _unflatten(flat) {
  const out = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }
  return out;
}

function exportLocale(lang) {
  if (lang === 'en') throw new Error('Cannot export the source (en) locale');
  // Start from existing target tree (if any) + merge in accepted/applied translations
  let base = {};
  try { base = _flatten(_loadLocaleTree(lang)); } catch { /* fresh language */ }

  const rows = getDb().prepare(`
    SELECT key, translated_text FROM translations
    WHERE language = ? AND status IN ('accepted', 'applied')
  `).all(lang);

  for (const r of rows) base[r.key] = r.translated_text;

  // Need original file header (register call with code + flag + name) — read en.js
  // for structure and substitute from existing file if possible.
  const enFile = fs.readFileSync(path.join(I18N_DIR, 'en.js'), 'utf8');
  const existingFile = fs.existsSync(path.join(I18N_DIR, `${lang}.js`))
    ? fs.readFileSync(path.join(I18N_DIR, `${lang}.js`), 'utf8') : null;

  // Header: keep first line (strict mode + comment) from existing file if present, else from en.js
  const headerMatch = (existingFile || enFile).match(/^('use strict';[\s\S]*?i18n\.register\([^,]+,[^,]+,[^,]+,)/);
  const header = headerMatch ? headerMatch[1] : `'use strict';\n\ni18n.register('${lang}', '${lang.toUpperCase()}', '${lang}',`;

  const tree = _unflatten(base);
  const body = JSON.stringify(tree, null, 2);
  return `${header} ${body});\n`;
}

function markExported(lang) {
  getDb().prepare(`
    UPDATE translations SET status = 'applied', updated_at = datetime('now')
    WHERE language = ? AND status = 'accepted'
  `).run(lang);
}

module.exports = {
  // Providers
  listProviders, getProvider, getProviderByName, upsertProvider, setProviderActive, deleteProvider,
  testProvider,
  // Usage
  getUsage, getAllUsage,
  // Translation
  translateBatch,
  // Locales
  listLanguages, listMissingKeys,
  // Review CRUD
  upsertTranslation, listTranslations, setTranslationStatus, editTranslation,
  // Export
  exportLocale, markExported,
  // Internals for tests
  _internals: { _yearMonth, _flatten, _unflatten, _loadLocaleTree, _listLocales },
};
