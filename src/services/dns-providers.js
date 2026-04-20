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

  // ─── DigitalOcean ──────────────────────────────────────
  digitalocean: {
    id: 'digitalocean',
    name: 'DigitalOcean',
    docsUrl: 'https://docs.digitalocean.com/reference/api/create-personal-access-token/',
    instructionsKey: 'acme.providers.digitalocean.instructions',
    fields: [
      {
        key: 'auth_token',
        label: 'Personal Access Token (Read+Write scope)',
        type: 'password',
        required: true,
        placeholder: 'dop_v1_...',
        helpText: 'Create at DigitalOcean Cloud → API → Tokens. Needs the "Write" scope to create DNS records.',
      },
    ],
    caddyConfigKey: 'digitalocean',
    supportsValidation: true,

    async validate(creds) {
      if (!creds || !creds.auth_token) return { ok: false, message: 'auth_token is required' };
      try {
        const { status, body } = await httpsGetJson(
          'https://api.digitalocean.com/v2/account',
          { Authorization: `Bearer ${creds.auth_token}` },
        );
        if (status === 401 || status === 403) {
          return { ok: false, message: 'Token invalid or insufficient permissions' };
        }
        if (status !== 200 || !body.account) {
          return { ok: false, message: `Unexpected response (HTTP ${status})` };
        }
        return { ok: true, message: `Token valid (account: ${body.account.email || 'unknown'})` };
      } catch (e) {
        return { ok: false, message: `DigitalOcean API unreachable: ${e.message}` };
      }
    },

    toCaddyConfig(credentialId) {
      return {
        name: 'digitalocean',
        auth_token: `{file./etc/caddy/secrets/${credentialId}/auth_token}`,
      };
    },
  },

  // ─── Hetzner DNS ───────────────────────────────────────
  hetzner: {
    id: 'hetzner',
    name: 'Hetzner DNS',
    docsUrl: 'https://docs.hetzner.com/dns-console/dns/general/api-access-token/',
    instructionsKey: 'acme.providers.hetzner.instructions',
    fields: [
      {
        key: 'api_token',
        label: 'API Token',
        type: 'password',
        required: true,
        placeholder: '32-char token',
        helpText: 'Create at Hetzner DNS Console → API tokens. Token has full DNS write access — store securely.',
      },
    ],
    caddyConfigKey: 'hetzner',
    supportsValidation: true,

    async validate(creds) {
      if (!creds || !creds.api_token) return { ok: false, message: 'api_token is required' };
      try {
        const { status, body } = await httpsGetJson(
          'https://dns.hetzner.com/api/v1/zones?per_page=1',
          { 'Auth-API-Token': creds.api_token },
        );
        if (status === 401 || status === 403) {
          return { ok: false, message: 'Token invalid' };
        }
        if (status !== 200) {
          return { ok: false, message: `Unexpected response (HTTP ${status})` };
        }
        const zoneCount = body.meta?.pagination?.total_entries ?? (body.zones?.length || 0);
        return { ok: true, message: `Token valid (${zoneCount} zones accessible)` };
      } catch (e) {
        return { ok: false, message: `Hetzner DNS API unreachable: ${e.message}` };
      }
    },

    toCaddyConfig(credentialId) {
      return {
        name: 'hetzner',
        api_token: `{file./etc/caddy/secrets/${credentialId}/api_token}`,
      };
    },
  },

  // ─── Linode (Akamai) ───────────────────────────────────
  linode: {
    id: 'linode',
    name: 'Linode (Akamai)',
    docsUrl: 'https://www.linode.com/docs/products/tools/api/guides/manage-api-tokens/',
    instructionsKey: 'acme.providers.linode.instructions',
    fields: [
      {
        key: 'api_token',
        label: 'Personal Access Token (Domains: Read/Write scope)',
        type: 'password',
        required: true,
        placeholder: '64-char hex token',
        helpText: 'Create at Cloud Manager → My Profile → API Tokens. Limit access to "Domains: Read/Write" only.',
      },
    ],
    caddyConfigKey: 'linode',
    supportsValidation: true,

    async validate(creds) {
      if (!creds || !creds.api_token) return { ok: false, message: 'api_token is required' };
      try {
        // Use /v4/domains?page_size=1 — proves the token has Domains scope specifically
        // (rather than just "valid token" via /profile)
        const { status, body } = await httpsGetJson(
          'https://api.linode.com/v4/domains?page_size=1',
          { Authorization: `Bearer ${creds.api_token}` },
        );
        if (status === 401) return { ok: false, message: 'Token invalid' };
        if (status === 403) return { ok: false, message: 'Token lacks Domains:Read scope' };
        if (status !== 200) return { ok: false, message: `Unexpected response (HTTP ${status})` };
        return { ok: true, message: `Token valid (${body.results || 0} domains)` };
      } catch (e) {
        return { ok: false, message: `Linode API unreachable: ${e.message}` };
      }
    },

    toCaddyConfig(credentialId) {
      return {
        name: 'linode',
        api_token: `{file./etc/caddy/secrets/${credentialId}/api_token}`,
      };
    },
  },

  // ─── AWS Route53 ───────────────────────────────────────
  // Note: Route53 needs AWS Signature V4 which is non-trivial. We delegate
  // validation to a lighter-weight check that confirms the credentials
  // PARSE correctly; full validation happens at issuance time when Caddy
  // attempts to create the TXT record.
  route53: {
    id: 'route53',
    name: 'AWS Route53',
    docsUrl: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/access-control-managing-permissions.html',
    instructionsKey: 'acme.providers.route53.instructions',
    fields: [
      {
        key: 'access_key_id',
        label: 'AWS Access Key ID',
        type: 'text',
        required: true,
        placeholder: 'AKIA...',
        helpText: 'Create an IAM user with a policy granting route53:ListHostedZones, route53:GetChange, route53:ChangeResourceRecordSets on the specific hosted zone(s).',
      },
      {
        key: 'secret_access_key',
        label: 'AWS Secret Access Key',
        type: 'password',
        required: true,
        placeholder: '40-char secret',
      },
      {
        key: 'region',
        label: 'AWS Region',
        type: 'text',
        required: false,
        placeholder: 'us-east-1 (default)',
        helpText: 'Route53 is global, but the SDK requires a region hint. us-east-1 works fine for most users.',
      },
    ],
    caddyConfigKey: 'route53',
    supportsValidation: true, // Format-level only — full AWS SigV4 check at issuance time

    // No-op validator — returns ok if fields are non-empty + format-sane.
    // Full validation happens at issuance time when Caddy tries to create the TXT record.
    async validate(creds) {
      if (!creds.access_key_id || !creds.secret_access_key) {
        return { ok: false, message: 'access_key_id and secret_access_key are required' };
      }
      // AWS Access Key IDs start with AKIA (long-lived) or ASIA (session)
      if (!/^(AKIA|ASIA)[A-Z0-9]{16}$/.test(creds.access_key_id)) {
        return { ok: false, message: 'Access Key ID format looks wrong (expected AKIA... or ASIA... + 16 chars)' };
      }
      if (creds.secret_access_key.length < 30) {
        return { ok: false, message: 'Secret Access Key looks too short (AWS secrets are 40 chars)' };
      }
      return {
        ok: true,
        message: 'Credentials parse correctly. Full validation will happen at first cert issuance (we cannot AWS-sign-v4 from here in v6.5).',
      };
    },

    toCaddyConfig(credentialId) {
      return {
        name: 'route53',
        access_key_id: `{file./etc/caddy/secrets/${credentialId}/access_key_id}`,
        secret_access_key: `{file./etc/caddy/secrets/${credentialId}/secret_access_key}`,
        region: `{file./etc/caddy/secrets/${credentialId}/region}`,
      };
    },
  },
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
