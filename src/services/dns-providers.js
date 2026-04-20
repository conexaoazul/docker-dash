'use strict';

// DNS Provider Registry — v6.5 Let's Encrypt Wizard
//
// Each provider entry is a self-contained spec:
//   - id              — short string, used as foreign-key value in DB
//   - name            — human-readable
//   - docsUrl         — link to provider's "create scoped token" docs
//   - fields          — credential field definitions for UI form generation
//   - caddyConfigKey  — Caddy DNS plugin module name (matches caddy-dns/<id>)
//   - validate(creds) — async, returns {ok, message, scope?} for pre-flight check
//   - toCaddyConfig(credentialId) — returns Caddy provider block with file substitutions
//
// To add a new provider: append an entry below + add `--with github.com/caddy-dns/<id>`
// in docker/caddy/Dockerfile. UI/orchestrator pick it up automatically.
//
// MVP: Cloudflare only. Tier 1 list (Route53, DigitalOcean, Hetzner, Linode) added
// in Session 2 once the orchestrator + UI shape are settled.

const https = require('https');

/**
 * Minimal HTTPS GET helper (returns parsed JSON or throws).
 * Avoids external deps; node-fetch alternative would also work but adds bytes.
 */
function httpsGetJson(url, headers = {}, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': 'docker-dash-acme/1.0', ...headers },
      timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, body: json });
        } catch (e) {
          reject(new Error(`Invalid JSON from ${u.hostname}: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(new Error(`Timeout ${timeoutMs}ms contacting ${u.hostname}`)); });
    req.end();
  });
}

const PROVIDERS = {
  // ─── Cloudflare ─────────────────────────────────────────
  cloudflare: {
    id: 'cloudflare',
    name: 'Cloudflare',
    docsUrl: 'https://developers.cloudflare.com/fundamentals/api/get-started/create-token/',
    instructionsKey: 'acme.providers.cloudflare.instructions',
    fields: [
      {
        key: 'api_token',
        label: 'API Token (scoped — NOT Global API Key)',
        type: 'password',
        required: true,
        placeholder: 'eyJhbGc... or 40+ char token',
        helpText: 'Create at Cloudflare Dashboard → My Profile → API Tokens. Use the "Edit zone DNS" template, scoped to the zones you want to issue certs for.',
      },
    ],
    caddyConfigKey: 'cloudflare',
    supportsValidation: true,

    /**
     * Validate token + (best-effort) check scope.
     * @param {{api_token: string}} creds
     * @returns {Promise<{ok: boolean, message: string, scope?: object[]}>}
     */
    async validate(creds) {
      if (!creds || !creds.api_token) {
        return { ok: false, message: 'api_token is required' };
      }
      // Reject Cloudflare Global API Key by format heuristic:
      // Global Key is exactly 37 hex characters; scoped tokens are longer + alphanumeric+special
      if (/^[0-9a-f]{37}$/.test(creds.api_token)) {
        return {
          ok: false,
          message: 'This looks like a Cloudflare Global API Key (37 hex chars). Please create a scoped API Token instead — Global keys grant full account access and are unsafe to store.',
        };
      }
      try {
        const { status, body } = await httpsGetJson(
          'https://api.cloudflare.com/client/v4/user/tokens/verify',
          { Authorization: `Bearer ${creds.api_token}` },
        );
        if (status !== 200 || !body.success) {
          const err = (body.errors && body.errors[0] && body.errors[0].message) || `HTTP ${status}`;
          return { ok: false, message: `Token verification failed: ${err}` };
        }
        return {
          ok: true,
          message: `Token valid (status: ${body.result?.status || 'active'})`,
          scope: body.result?.policies,
        };
      } catch (e) {
        return { ok: false, message: `Cloudflare API unreachable: ${e.message}` };
      }
    },

    /**
     * Render the Caddy provider config block, with file substitution for the secret.
     * The credential file lives at /etc/caddy/secrets/<credentialId>/api_token.
     */
    toCaddyConfig(credentialId) {
      return {
        name: 'cloudflare',
        api_token: `{file./etc/caddy/secrets/${credentialId}/api_token}`,
      };
    },
  },

  // ─── Future Tier-1 providers (Route53, DigitalOcean, Hetzner, Linode) ──
  // Skeleton for Session 2 — left here as documentation, NOT registered yet
  // until validators + Caddy plugin keys are confirmed. Don't expose half-built
  // providers in the UI.
  //
  // route53:      { ... },
  // digitalocean: { ... },
  // hetzner:      { ... },
  // linode:       { ... },
};

/**
 * Public-facing list (without function refs — safe to JSON-serialize for API).
 */
function list() {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    name: p.name,
    docsUrl: p.docsUrl,
    instructionsKey: p.instructionsKey,
    fields: p.fields,
    caddyConfigKey: p.caddyConfigKey,
    supportsValidation: p.supportsValidation,
  }));
}

/** Look up a provider by id (returns full spec, including functions). */
function get(providerId) {
  return PROVIDERS[providerId] || null;
}

/** Validate credentials against the given provider's API. */
async function validate(providerId, credentials) {
  const p = PROVIDERS[providerId];
  if (!p) return { ok: false, message: `Unknown provider: ${providerId}` };
  if (!p.supportsValidation) return { ok: true, message: 'Validation not supported for this provider' };
  return p.validate(credentials);
}

/** Render Caddy DNS provider config block for a stored credential. */
function toCaddyConfig(providerId, credentialId) {
  const p = PROVIDERS[providerId];
  if (!p) throw new Error(`Unknown provider: ${providerId}`);
  return p.toCaddyConfig(credentialId);
}

module.exports = { list, get, validate, toCaddyConfig };
