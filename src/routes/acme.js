'use strict';

// ACME / Let's Encrypt Wizard routes — v6.5
// Spec: docs/planning/v6.5/letsencrypt-wizard/02-feature-spec.md §8

const { Router } = require('express');
const { requireAuth, requireRole, writeable } = require('../middleware/auth');
const { getClientIp } = require('../utils/helpers');
const auditService = require('../services/audit');
const { getDb } = require('../db');
const log = require('../utils/logger')('acme');

const dnsProviders = require('../services/dns-providers');
const acme = require('../services/acme');
const caddyConfig = require('../services/caddy-config');

const router = Router();

// ─── Provider registry ─────────────────────────────────

// GET /providers — list available DNS providers + their field schemas
router.get('/providers', requireAuth, requireRole('admin', 'operator'), (req, res) => {
  try {
    res.json({ providers: dnsProviders.list() });
  } catch (err) {
    log.error('list providers', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Credentials CRUD ──────────────────────────────────

// GET /credentials — list saved credentials (NEVER returns the secret values)
router.get('/credentials', requireAuth, requireRole('admin', 'operator'), (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, name, provider_id AS providerId, created_by AS createdBy,
             created_at AS createdAt, updated_at AS updatedAt,
             last_used_at AS lastUsedAt, last_validated_at AS lastValidatedAt,
             last_validation_status AS lastValidationStatus,
             last_validation_message AS lastValidationMessage
      FROM acme_credentials
      ORDER BY name ASC
    `).all();
    res.json({ credentials: rows });
  } catch (err) {
    log.error('list credentials', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /credentials — create a new credential
router.post('/credentials', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const { name, providerId, credentials, validateImmediately } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'name (string) required' });
    }
    if (!/^[a-zA-Z0-9 _.-]{1,64}$/.test(name)) {
      return res.status(400).json({ error: 'name must be 1-64 chars: alphanumeric, space, dot, underscore, dash' });
    }
    if (!providerId || !dnsProviders.get(providerId)) {
      return res.status(400).json({ error: `Unknown provider: ${providerId}` });
    }
    if (!credentials || typeof credentials !== 'object') {
      return res.status(400).json({ error: 'credentials object required' });
    }

    let result;
    try {
      result = await acme.createCredential({
        name, providerId, credentials, userId: req.user.id,
      });
    } catch (e) {
      if (/UNIQUE/.test(e.message)) {
        return res.status(409).json({ error: `A credential named "${name}" already exists`, code: 'DUPLICATE_NAME' });
      }
      throw e;
    }

    let validation = null;
    if (validateImmediately) {
      try {
        validation = await acme.validateCredentialById(result.id);
      } catch (e) {
        validation = { ok: false, message: e.message };
      }
    }

    auditService.log({
      userId: req.user.id, username: req.user.username,
      action: 'acme_credential_create', targetType: 'acme_credential', targetId: String(result.id),
      details: { name, providerId, validatedOnSave: !!validateImmediately, validationStatus: validation?.ok },
      ip: getClientIp(req),
    });

    res.status(201).json({ ...result, validation });
  } catch (err) {
    log.error('create credential', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /credentials/:id — rotate credential value
router.patch('/credentials/:id', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { credentials } = req.body || {};
    if (!credentials || typeof credentials !== 'object') {
      return res.status(400).json({ error: 'credentials object required' });
    }

    await acme.rotateCredential(id, credentials);

    auditService.log({
      userId: req.user.id, username: req.user.username,
      action: 'acme_credential_update', targetType: 'acme_credential', targetId: String(id),
      details: { fieldsRotated: Object.keys(credentials) },
      ip: getClientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    if (/not found/.test(err.message)) {
      return res.status(404).json({ error: err.message });
    }
    log.error('rotate credential', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /credentials/:id
router.delete('/credentials/:id', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await acme.deleteCredential(id);

    auditService.log({
      userId: req.user.id, username: req.user.username,
      action: 'acme_credential_delete', targetType: 'acme_credential', targetId: String(id),
      ip: getClientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    if (/in use/.test(err.message)) return res.status(409).json({ error: err.message, code: 'IN_USE' });
    if (/not found/.test(err.message)) return res.status(404).json({ error: err.message });
    log.error('delete credential', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /credentials/:id/validate — re-validate against provider API
router.post('/credentials/:id/validate', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = await acme.validateCredentialById(id);

    auditService.log({
      userId: req.user.id, username: req.user.username,
      action: 'acme_credential_validate', targetType: 'acme_credential', targetId: String(id),
      details: { status: result.ok ? 'ok' : 'failed' },
      ip: getClientIp(req),
    });

    res.json(result);
  } catch (err) {
    if (/not found/.test(err.message)) return res.status(404).json({ error: err.message });
    log.error('validate credential', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Issuance ──────────────────────────────────────────

// POST /issue — request a new certificate
router.post('/issue', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const { domains, email, challengeType, providerId, credentialsId, staging } = req.body || {};

    if (!Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({ error: 'domains array required (at least one)' });
    }
    if (domains.length > 100) {
      return res.status(400).json({ error: 'Too many domains (max 100 per cert)' });
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ error: 'valid email required' });
    }
    if (challengeType !== 'http-01' && challengeType !== 'dns-01') {
      return res.status(400).json({ error: 'challengeType must be http-01 or dns-01' });
    }
    if (challengeType === 'dns-01' && (!providerId || !credentialsId)) {
      return res.status(400).json({ error: 'providerId and credentialsId required for dns-01' });
    }

    let result;
    try {
      result = await acme.issueCertificate({
        domains, email, challengeType,
        providerId: providerId || null,
        credentialsId: credentialsId || null,
        staging: !!staging,
        userId: req.user.id,
      });
    } catch (e) {
      // Wildcard validation rejection from acme.js
      if (/wildcard|dns-01/i.test(e.message)) {
        return res.status(400).json({ error: e.message });
      }
      throw e;
    }

    auditService.log({
      userId: req.user.id, username: req.user.username,
      action: 'acme_issuance_request', targetType: 'acme_job', targetId: String(result.jobId),
      details: { domains, challengeType, providerId, credentialsId, staging: !!staging, deduped: !!result.deduped },
      ip: getClientIp(req),
    });

    res.status(202).json(result);
  } catch (err) {
    log.error('issue certificate', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /jobs/:id — poll job status
router.get('/jobs/:id', requireAuth, requireRole('admin', 'operator'), (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const db = getDb();
    const row = db.prepare(`
      SELECT id, domains, challenge_type AS challengeType, provider_id AS providerId,
             credentials_id AS credentialsId, staging, status, output, error_class AS errorClass,
             cert_id AS certId, created_by AS createdBy, created_at AS createdAt,
             started_at AS startedAt, completed_at AS completedAt
      FROM acme_jobs WHERE id = ?
    `).get(id);
    if (!row) return res.status(404).json({ error: 'Job not found' });
    res.json(row);
  } catch (err) {
    log.error('get job', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /managed-certs — list all ACME-managed certs
router.get('/managed-certs', requireAuth, requireRole('admin', 'operator'), (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT mc.domain, mc.challenge_type AS challengeType, mc.provider_id AS providerId,
             mc.credentials_id AS credentialsId, mc.staging, mc.caddy_policy_index AS caddyPolicyIndex,
             mc.cert_id AS certId, mc.created_at AS createdAt, mc.updated_at AS updatedAt,
             c.name AS credentialName
      FROM acme_managed_certs mc
      LEFT JOIN acme_credentials c ON c.id = mc.credentials_id
      ORDER BY mc.created_at DESC
    `).all();
    res.json({ certs: rows });
  } catch (err) {
    log.error('list managed certs', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /cert/:domain — remove an ACME-managed certificate
router.delete('/cert/:domain', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const domain = req.params.domain;
    await acme.removeCertificate(domain);

    auditService.log({
      userId: req.user.id, username: req.user.username,
      action: 'acme_certificate_remove', targetType: 'acme_managed_cert', targetId: domain,
      ip: getClientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    if (/No ACME-managed cert/.test(err.message)) return res.status(404).json({ error: err.message });
    log.error('remove cert', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /health — is Caddy admin reachable?
router.get('/health', requireAuth, requireRole('admin', 'operator'), async (req, res) => {
  try {
    const ok = await caddyConfig.isHealthy();
    res.json({
      caddy: ok,
      message: ok
        ? 'Caddy admin API reachable'
        : 'Caddy admin API not reachable. Make sure the TLS profile is enabled (docker compose --profile tls up -d) and the caddy-admin-sock volume is mounted.',
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
