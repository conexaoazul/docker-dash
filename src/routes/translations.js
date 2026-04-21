'use strict';

// Translations routes — v6.11.0 (/api/translations/*)
// All endpoints are admin-only.

const { Router } = require('express');
const { requireAuth, requireRole, writeable } = require('../middleware/auth');
const { getClientIp } = require('../utils/helpers');
const auditService = require('../services/audit');
const translations = require('../services/translations');
const log = require('../utils/logger')('translations');

const router = Router();

// ─── Providers ─────────────────────────────────────────

router.get('/providers', requireAuth, requireRole('admin'), (req, res) => {
  try {
    res.json({ providers: translations.listProviders() });
  } catch (err) {
    log.error('list providers', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/providers', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const { provider, apiKey, monthlyLimit, notes } = req.body || {};
    const result = translations.upsertProvider({ provider, apiKey, monthlyLimit, notes });
    await auditService.log({
      userId: req.user?.id, username: req.user?.username, ip: getClientIp(req),
      action: result.updated ? 'translation_provider_updated' : 'translation_provider_created',
      details: { provider, monthlyLimit: monthlyLimit || 500000 },
    });
    res.status(result.updated ? 200 : 201).json({ ok: true, ...result });
  } catch (err) {
    if (/Unknown provider|apiKey/i.test(err.message)) return res.status(400).json({ error: err.message });
    log.error('upsert provider', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/providers/:id/test', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const p = translations.getProvider(id);
    if (!p) return res.status(404).json({ error: 'Provider not found' });
    const result = await translations.testProvider(p.provider);
    res.json({ ok: true, provider: p.provider, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.patch('/providers/:id', requireAuth, requireRole('admin'), writeable, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = translations.getProvider(id);
    if (!existing) return res.status(404).json({ error: 'Provider not found' });
    if (typeof req.body?.isActive === 'boolean') translations.setProviderActive(id, req.body.isActive);
    res.json({ ok: true, provider: translations.getProvider(id) });
  } catch (err) {
    log.error('patch provider', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/providers/:id', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const p = translations.getProvider(id);
    if (!p) return res.status(404).json({ error: 'Provider not found' });
    translations.deleteProvider(id);
    await auditService.log({
      userId: req.user?.id, username: req.user?.username, ip: getClientIp(req),
      action: 'translation_provider_deleted',
      details: { provider: p.provider },
    });
    res.json({ ok: true });
  } catch (err) {
    log.error('delete provider', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Usage ─────────────────────────────────────────────

router.get('/usage', requireAuth, requireRole('admin', 'operator'), (req, res) => {
  try {
    const ym = req.query.yearMonth || undefined;
    res.json({ usage: translations.getAllUsage(ym), yearMonth: ym || new Date().toISOString().slice(0, 7) });
  } catch (err) {
    log.error('usage', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Locales ───────────────────────────────────────────

router.get('/languages', requireAuth, requireRole('admin', 'operator'), (req, res) => {
  try {
    res.json({ languages: translations.listLanguages() });
  } catch (err) {
    log.error('languages', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

router.get('/missing', requireAuth, requireRole('admin', 'operator'), (req, res) => {
  try {
    const lang = req.query.language;
    if (!lang) return res.status(400).json({ error: 'language query param required' });
    res.json({ language: lang, missing: translations.listMissingKeys(lang) });
  } catch (err) {
    log.error('missing', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Batch translate ───────────────────────────────────

router.post('/batch', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const { provider, language, keys } = req.body || {};
    if (!provider || !language || !Array.isArray(keys) || keys.length === 0) {
      return res.status(400).json({ error: 'provider, language, keys[] required' });
    }
    if (keys.length > 50) return res.status(400).json({ error: 'Maximum 50 keys per batch' });

    // Resolve source texts from missing-keys (to ensure keys are actually missing)
    const allMissing = translations.listMissingKeys(language);
    const byKey = new Map(allMissing.map((m) => [m.key, m]));
    const toTranslate = keys.map((k) => byKey.get(k)).filter(Boolean);
    if (toTranslate.length === 0) return res.status(400).json({ error: 'No valid keys (already translated or unknown)' });

    const texts = toTranslate.map((t) => t.source_text);
    const result = await translations.translateBatch({ provider, texts, targetLang: language });

    // Persist each translation as pending
    for (let i = 0; i < toTranslate.length; i++) {
      translations.upsertTranslation({
        language,
        key: toTranslate[i].key,
        source_text: toTranslate[i].source_text,
        translated_text: result.translated[i] || '',
        provider,
        chars_used: (toTranslate[i].source_text || '').length,
      });
    }

    await auditService.log({
      userId: req.user?.id, username: req.user?.username, ip: getClientIp(req),
      action: 'translation_batch',
      details: { provider, language, count: toTranslate.length, chars: result.chars },
    });

    res.json({
      ok: true,
      translated: toTranslate.map((t, i) => ({ key: t.key, source_text: t.source_text, translated_text: result.translated[i] })),
      chars: result.chars,
      provider,
    });
  } catch (err) {
    if (err.code === 'QUOTA_EXCEEDED') {
      return res.status(429).json({ error: err.message, used: err.used, requested: err.requested, limit: err.limit });
    }
    if (/required|Unknown|exceed/i.test(err.message)) return res.status(400).json({ error: err.message });
    log.error('batch translate', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// ─── Review ────────────────────────────────────────────

router.get('/', requireAuth, requireRole('admin', 'operator'), (req, res) => {
  try {
    res.json({
      items: translations.listTranslations({
        language: req.query.language,
        status: req.query.status,
      }),
    });
  } catch (err) {
    log.error('list translations', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.patch('/:id', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, translated_text } = req.body || {};
    if (translated_text) translations.editTranslation(id, translated_text);
    if (status) translations.setTranslationStatus(id, status);
    await auditService.log({
      userId: req.user?.id, username: req.user?.username, ip: getClientIp(req),
      action: 'translation_reviewed', details: { id, status, edited: Boolean(translated_text) },
    });
    res.json({ ok: true });
  } catch (err) {
    if (/Invalid|required/i.test(err.message)) return res.status(400).json({ error: err.message });
    log.error('patch translation', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Export locale file ────────────────────────────────

router.get('/export', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const lang = req.query.language;
    if (!lang) return res.status(400).json({ error: 'language query param required' });
    const content = translations.exportLocale(lang);
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${lang}.js"`);
    res.send(content);
  } catch (err) {
    log.error('export locale', err);
    res.status(400).json({ error: err.message || 'Export failed' });
  }
});

router.post('/mark-exported', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const { language } = req.body || {};
    if (!language) return res.status(400).json({ error: 'language required' });
    translations.markExported(language);
    await auditService.log({
      userId: req.user?.id, username: req.user?.username, ip: getClientIp(req),
      action: 'translation_exported', details: { language },
    });
    res.json({ ok: true });
  } catch (err) {
    log.error('mark exported', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
