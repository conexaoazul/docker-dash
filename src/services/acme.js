'use strict';

// ACME Orchestrator — v6.5 Let's Encrypt Wizard
//
// Coordinates the issuance workflow:
//   1. Persist credentials (encrypted) + write Caddy-readable secret files
//   2. Validate credentials against provider API (optional)
//   3. Push the new TLS policy to Caddy via admin API
//   4. Poll for cert appearance / failure
//   5. Record outcome in acme_jobs + acme_managed_certs
//
// This is the orchestrator skeleton (Session 1). Issuance polling, error
// classification, WebSocket progress, and the actual cert-tracking handoff
// land in Session 2.

const fs = require('fs').promises;
const path = require('path');
const log = require('../utils/logger')('acme');
const { encrypt, decrypt } = require('../utils/crypto');
const { getDb } = require('../db');
const dnsProviders = require('./dns-providers');
const caddyConfig = require('./caddy-config');

// WS broadcaster is set up lazily — server wires it via setWsBroadcaster().
// Services should never hard-depend on the WS server module (test reachability).
let _wsBroadcaster = null;
function setWsBroadcaster(fn) { _wsBroadcaster = fn; }
function _publishJobUpdate(jobId) {
  if (!_wsBroadcaster) return;
  try {
    const row = getDb().prepare('SELECT id, status, error_class, output, started_at, completed_at FROM acme_jobs WHERE id = ?').get(jobId);
    if (row) _wsBroadcaster(`acme:job:${jobId}`, row);
  } catch (e) {
    log.warn('WS publish failed (non-fatal)', { jobId, error: e.message });
  }
}

// Where Caddy reads credential files. Both the app and the caddy container
// see the same path, since they share the caddy-secrets Docker volume.
// Read per-call (not at module load) so tests can override after import.
function _secretsDir() {
  return process.env.CADDY_SECRETS_DIR || '/data/caddy-secrets';
}

// ─── Credential management ─────────────────────────────────

/**
 * Save a new DNS provider credential.
 * Stores AES-GCM-encrypted JSON in DB + writes one file per field for Caddy.
 *
 * @param {object} args
 * @param {string} args.name - user-friendly name (unique)
 * @param {string} args.providerId
 * @param {object} args.credentials - {key: value} per provider's fields[]
 * @param {number} [args.userId] - creating user
 * @returns {Promise<{id: number, name: string, providerId: string}>}
 */
async function createCredential({ name, providerId, credentials, userId }) {
  if (!name) throw new Error('name required');
  const provider = dnsProviders.get(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);

  // Verify all required fields present
  for (const f of provider.fields) {
    if (f.required && !credentials[f.key]) {
      throw new Error(`Missing required credential field: ${f.key}`);
    }
  }

  const db = getDb();
  const encrypted = encrypt(JSON.stringify(credentials));

  const result = db.prepare(`
    INSERT INTO acme_credentials (name, provider_id, credentials_encrypted, created_by)
    VALUES (?, ?, ?, ?)
  `).run(name, providerId, encrypted, userId || null);

  const credentialId = result.lastInsertRowid;

  try {
    await writeCredentialFiles(credentialId, credentials);
  } catch (e) {
    // Roll back DB row if filesystem write fails
    db.prepare('DELETE FROM acme_credentials WHERE id = ?').run(credentialId);
    throw new Error(`Failed to write credential files: ${e.message}`);
  }

  log.info('Credential created', { id: credentialId, name, providerId });
  return { id: credentialId, name, providerId };
}

/**
 * Update an existing credential's value (rotation flow).
 * Atomically replaces the on-disk files. Caddy picks up the new value on the
 * next request — NO Caddy reload needed (verified preflight A3).
 */
async function rotateCredential(credentialId, newCredentials) {
  const db = getDb();
  const row = db.prepare('SELECT id, provider_id FROM acme_credentials WHERE id = ?').get(credentialId);
  if (!row) throw new Error(`Credential ${credentialId} not found`);

  const provider = dnsProviders.get(row.provider_id);
  if (!provider) throw new Error(`Unknown provider on stored credential: ${row.provider_id}`);

  for (const f of provider.fields) {
    if (f.required && !newCredentials[f.key]) {
      throw new Error(`Missing required credential field: ${f.key}`);
    }
  }

  const encrypted = encrypt(JSON.stringify(newCredentials));
  db.prepare(`
    UPDATE acme_credentials SET credentials_encrypted = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(encrypted, credentialId);

  await writeCredentialFiles(credentialId, newCredentials);
  log.info('Credential rotated', { id: credentialId, providerId: row.provider_id });
}

/**
 * Delete a credential (and its on-disk files).
 * Throws if any acme_managed_cert references it.
 */
async function deleteCredential(credentialId) {
  const db = getDb();
  const inUse = db.prepare('SELECT domain FROM acme_managed_certs WHERE credentials_id = ? LIMIT 1').get(credentialId);
  if (inUse) {
    throw new Error(`Credential is in use by certificate '${inUse.domain}'. Remove the cert first.`);
  }

  const row = db.prepare('SELECT id, name FROM acme_credentials WHERE id = ?').get(credentialId);
  if (!row) throw new Error(`Credential ${credentialId} not found`);

  db.prepare('DELETE FROM acme_credentials WHERE id = ?').run(credentialId);
  await deleteCredentialFiles(credentialId);
  log.info('Credential deleted', { id: credentialId, name: row.name });
}

/**
 * Read + decrypt stored credentials. Internal use only — never exposed via API.
 */
function _readCredentials(credentialId) {
  const db = getDb();
  const row = db.prepare('SELECT id, provider_id, credentials_encrypted FROM acme_credentials WHERE id = ?').get(credentialId);
  if (!row) throw new Error(`Credential ${credentialId} not found`);
  const credentials = JSON.parse(decrypt(row.credentials_encrypted));
  return { credentialId: row.id, providerId: row.provider_id, credentials };
}

/**
 * Validate stored credentials against the provider's API.
 */
async function validateCredentialById(credentialId) {
  const { providerId, credentials } = _readCredentials(credentialId);
  const result = await dnsProviders.validate(providerId, credentials);

  // Persist the result for UI display (last_validated_at, last_validation_status)
  const db = getDb();
  db.prepare(`
    UPDATE acme_credentials
    SET last_validated_at = datetime('now'),
        last_validation_status = ?,
        last_validation_message = ?
    WHERE id = ?
  `).run(result.ok ? 'ok' : 'failed', result.message || '', credentialId);

  return result;
}

// ─── Filesystem ops (Caddy secret files) ───────────────────

/**
 * Write credential field files atomically.
 * Layout: /data/caddy-secrets/<credentialId>/<fieldName>
 * Caddy mounts /data/caddy-secrets at /etc/caddy/secrets:ro
 * Caddy reads files per-request (preflight A3) — no reload needed after write.
 */
async function writeCredentialFiles(credentialId, credentials) {
  const dir = path.join(_secretsDir(), String(credentialId));
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  for (const [key, value] of Object.entries(credentials)) {
    const filePath = path.join(dir, key);
    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, String(value), { mode: 0o600 });
    await fs.rename(tmpPath, filePath);
  }
}

async function deleteCredentialFiles(credentialId) {
  const dir = path.join(_secretsDir(), String(credentialId));
  await fs.rm(dir, { recursive: true, force: true });
}

// ─── Issuance (skeleton — full flow in Session 2) ──────────

/**
 * Create a new ACME issuance job. Returns the job id immediately;
 * the caller is expected to poll /jobs/:id or subscribe via WebSocket.
 *
 * NOTE (Session 1 status): this skeleton creates the job row + pushes the
 * Caddy policy synchronously. Session 2 adds:
 *   - Async job execution with WebSocket progress
 *   - Credential validation pre-flight
 *   - Polling for cert file appearance
 *   - Error classification
 *   - tracked_certificates handoff
 */
async function issueCertificate({
  domains, email, challengeType, providerId, credentialsId, staging, userId,
}) {
  if (!Array.isArray(domains) || domains.length === 0) throw new Error('domains array required');
  if (!email) throw new Error('email required');

  // Wildcards force DNS-01
  const hasWildcard = domains.some((d) => d.startsWith('*.'));
  if (hasWildcard && challengeType !== 'dns-01') {
    throw new Error('Wildcard domains require dns-01 challenge');
  }

  const db = getDb();

  // Dedup: if there's a job in progress for the same domain set in the last 30s,
  // return its id instead of creating a duplicate
  const sortedDomains = [...domains].sort().join(',');
  const recent = db.prepare(`
    SELECT id FROM acme_jobs
    WHERE domains = ? AND status IN ('pending', 'running')
      AND created_at > datetime('now', '-30 seconds')
    ORDER BY id DESC LIMIT 1
  `).get(sortedDomains);
  if (recent) {
    log.info('Returning existing ACME job (dedup)', { jobId: recent.id, domains });
    return { jobId: recent.id, deduped: true };
  }

  const job = db.prepare(`
    INSERT INTO acme_jobs (domains, challenge_type, provider_id, credentials_id, staging, status, created_by)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(sortedDomains, challengeType, providerId || null, credentialsId || null, staging ? 1 : 0, userId || null);

  const jobId = job.lastInsertRowid;
  log.info('ACME job created', { jobId, domains, challengeType, providerId, staging });
  _publishJobUpdate(jobId);

  // Skeleton: synchronous push for now. Session 2 wraps this in async runner + WS events.
  try {
    let providerConfig;
    if (challengeType === 'dns-01') {
      if (!providerId || !credentialsId) {
        throw new Error('providerId and credentialsId required for dns-01');
      }
      providerConfig = dnsProviders.toCaddyConfig(providerId, credentialsId);
    }

    const { policyIndex } = await caddyConfig.addAcmePolicy({
      subjects: domains,
      email,
      challengeType,
      providerConfig,
      staging,
    });

    db.prepare(`
      UPDATE acme_jobs SET status = 'running', started_at = datetime('now') WHERE id = ?
    `).run(jobId);
    _publishJobUpdate(jobId);

    db.prepare(`
      INSERT INTO acme_managed_certs (domain, challenge_type, provider_id, credentials_id, staging, caddy_policy_index)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(domain) DO UPDATE SET
        challenge_type = excluded.challenge_type,
        provider_id = excluded.provider_id,
        credentials_id = excluded.credentials_id,
        staging = excluded.staging,
        caddy_policy_index = excluded.caddy_policy_index,
        updated_at = datetime('now')
    `).run(sortedDomains, challengeType, providerId || null, credentialsId || null, staging ? 1 : 0, policyIndex);

    if (credentialsId) {
      db.prepare(`UPDATE acme_credentials SET last_used_at = datetime('now') WHERE id = ?`).run(credentialsId);
    }

    return { jobId, policyIndex, deduped: false };
  } catch (e) {
    log.error('ACME issuance push failed', { jobId, error: e.message });
    db.prepare(`
      UPDATE acme_jobs
      SET status = 'failed', error_class = 'caddy', output = ?, completed_at = datetime('now')
      WHERE id = ?
    `).run(e.message, jobId);
    _publishJobUpdate(jobId);
    throw e;
  }
}

/**
 * Remove an ACME-managed certificate (Caddy policy + DB row).
 */
async function removeCertificate(domain) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM acme_managed_certs WHERE domain = ?').get(domain);
  if (!row) throw new Error(`No ACME-managed cert for domain: ${domain}`);

  const subjects = domain.split(',');
  const removed = await caddyConfig.removeAcmePolicyBySubjects(subjects);
  if (!removed) {
    log.warn('Caddy had no matching policy for cert (already gone?)', { domain });
  }

  db.prepare('DELETE FROM acme_managed_certs WHERE domain = ?').run(domain);
  log.info('ACME cert removed', { domain });
}

module.exports = {
  // Credentials
  createCredential,
  rotateCredential,
  deleteCredential,
  validateCredentialById,
  // Issuance
  issueCertificate,
  removeCertificate,
  // WS wiring (called once at server boot)
  setWsBroadcaster,
  // Internal exports for tests
  _readCredentials,
  _writeCredentialFiles: writeCredentialFiles,
  _deleteCredentialFiles: deleteCredentialFiles,
};
