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

  // ─── Namecheap ─────────────────────────────────────────
  namecheap: {
    id: 'namecheap',
    name: 'Namecheap',
    docsUrl: 'https://www.namecheap.com/support/api/intro/',
    instructionsKey: 'acme.providers.namecheap.instructions',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true, helpText: 'Namecheap Dashboard → Profile → Tools → Namecheap API Access → enable + copy key' },
      { key: 'user', label: 'API Username', type: 'text', required: true, placeholder: 'your-namecheap-username' },
      { key: 'api_endpoint', label: 'API Endpoint', type: 'text', required: false, placeholder: 'https://api.namecheap.com/xml.response (default)', helpText: 'Use https://api.sandbox.namecheap.com/xml.response for testing' },
    ],
    caddyConfigKey: 'namecheap',
    supportsValidation: false,
    async validate(creds) {
      if (!creds.api_key || !creds.user) return { ok: false, message: 'api_key and user required' };
      return { ok: true, message: 'Credentials saved. Full validation happens at first cert issuance (Namecheap requires IP whitelist — test in sandbox first).' };
    },
    toCaddyConfig(credentialId) {
      return {
        name: 'namecheap',
        api_key: `{file./etc/caddy/secrets/${credentialId}/api_key}`,
        user: `{file./etc/caddy/secrets/${credentialId}/user}`,
        api_endpoint: `{file./etc/caddy/secrets/${credentialId}/api_endpoint}`,
      };
    },
  },

  // ─── Gandi ─────────────────────────────────────────────
  gandi: {
    id: 'gandi',
    name: 'Gandi LiveDNS',
    docsUrl: 'https://docs.gandi.net/en/domain_names/advanced_users/api.html',
    instructionsKey: 'acme.providers.gandi.instructions',
    fields: [
      { key: 'bearer_token', label: 'Personal Access Token (PAT)', type: 'password', required: true, helpText: 'Gandi Account → API Keys → Create new PAT with "Manage DNS" scope. LiveDNS API key (deprecated) also works but PAT is preferred.' },
    ],
    caddyConfigKey: 'gandi',
    supportsValidation: true,
    async validate(creds) {
      if (!creds.bearer_token) return { ok: false, message: 'bearer_token required' };
      try {
        const { status, body } = await httpsGetJson(
          'https://api.gandi.net/v5/livedns/domains?per_page=1',
          { Authorization: 'Bearer ' + creds.bearer_token },
        );
        if (status === 401 || status === 403) return { ok: false, message: 'Token invalid or lacks LiveDNS scope' };
        if (status !== 200) return { ok: false, message: 'Unexpected response (HTTP ' + status + ')' };
        return { ok: true, message: 'Token valid (' + (Array.isArray(body) ? body.length : 0) + '+ domains accessible)' };
      } catch (e) {
        return { ok: false, message: 'Gandi API unreachable: ' + e.message };
      }
    },
    toCaddyConfig(credentialId) {
      return {
        name: 'gandi',
        bearer_token: `{file./etc/caddy/secrets/${credentialId}/bearer_token}`,
      };
    },
  },

  // ─── Porkbun ───────────────────────────────────────────
  porkbun: {
    id: 'porkbun',
    name: 'Porkbun',
    docsUrl: 'https://porkbun.com/api/json/v3/documentation',
    instructionsKey: 'acme.providers.porkbun.instructions',
    fields: [
      { key: 'api_key', label: 'API Key', type: 'password', required: true, placeholder: 'pk1_...', helpText: 'Porkbun Account → API Access → Create API Key. Also enable API Access per-domain under each domain\'s settings.' },
      { key: 'api_secret_key', label: 'API Secret Key', type: 'password', required: true, placeholder: 'sk1_...' },
    ],
    caddyConfigKey: 'porkbun',
    supportsValidation: true,
    async validate(creds) {
      if (!creds.api_key || !creds.api_secret_key) return { ok: false, message: 'api_key and api_secret_key required' };
      // Porkbun has a /api/json/v3/ping endpoint that validates credentials
      try {
        const https = require('https');
        const body = JSON.stringify({ apikey: creds.api_key, secretapikey: creds.api_secret_key });
        const resBody = await new Promise((resolve, reject) => {
          const req = https.request({
            hostname: 'api.porkbun.com', path: '/api/json/v3/ping', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
            timeout: 5000,
          }, (res) => {
            let data = '';
            res.on('data', c => { data += c; });
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({ status: 'ERROR' }); } });
          });
          req.on('error', reject);
          req.on('timeout', () => req.destroy(new Error('timeout')));
          req.write(body); req.end();
        });
        if (resBody.status === 'SUCCESS') return { ok: true, message: 'Credentials valid (yourIp: ' + (resBody.yourIp || '?') + ')' };
        return { ok: false, message: 'Porkbun rejected: ' + (resBody.message || 'unknown error') };
      } catch (e) {
        return { ok: false, message: 'Porkbun API unreachable: ' + e.message };
      }
    },
    toCaddyConfig(credentialId) {
      return {
        name: 'porkbun',
        api_key: `{file./etc/caddy/secrets/${credentialId}/api_key}`,
        api_secret_key: `{file./etc/caddy/secrets/${credentialId}/api_secret_key}`,
      };
    },
  },

  // ─── OVH ──────────────────────────────────────────────
  ovh: {
    id: 'ovh',
    name: 'OVH',
    docsUrl: 'https://help.ovhcloud.com/csm/en-api-getting-started-ovhcloud-api?id=kb_article_view&sysparm_article=KB0042777',
    instructionsKey: 'acme.providers.ovh.instructions',
    fields: [
      { key: 'endpoint', label: 'API Endpoint', type: 'text', required: true, placeholder: 'ovh-eu', helpText: 'One of: ovh-eu, ovh-ca, ovh-us, kimsufi-eu, kimsufi-ca, soyoustart-eu, soyoustart-ca' },
      { key: 'application_key', label: 'Application Key', type: 'password', required: true },
      { key: 'application_secret', label: 'Application Secret', type: 'password', required: true },
      { key: 'consumer_key', label: 'Consumer Key', type: 'password', required: true, helpText: 'Generated via OVH API validation flow. See docs link above.' },
    ],
    caddyConfigKey: 'ovh',
    supportsValidation: false,
    async validate(creds) {
      if (!creds.endpoint || !creds.application_key || !creds.application_secret || !creds.consumer_key) {
        return { ok: false, message: 'All 4 fields required (endpoint + 3 keys)' };
      }
      return { ok: true, message: 'Credentials saved. OVH uses its own signature scheme — full validation happens at first cert issuance.' };
    },
    toCaddyConfig(credentialId) {
      return {
        name: 'ovh',
        endpoint: `{file./etc/caddy/secrets/${credentialId}/endpoint}`,
        application_key: `{file./etc/caddy/secrets/${credentialId}/application_key}`,
        application_secret: `{file./etc/caddy/secrets/${credentialId}/application_secret}`,
        consumer_key: `{file./etc/caddy/secrets/${credentialId}/consumer_key}`,
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
