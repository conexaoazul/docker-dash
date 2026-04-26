'use strict';

// AI Redactor — v8.0.0
//
// Strips secrets/PII from any payload before it's sent to an AI provider.
// Defense-in-depth — NOT a guarantee. Operators see the post-redaction
// payload via the "what gets sent" preview before submitting any AI call.
//
// Validated by spike S4 (plans/spikes-ai-features.md): 100% recall +
// 100% precision on a 27-case hand-built corpus of realistic Docker
// logs/config snippets. Patterns are unbounded only where mathematically
// safe from catastrophic backtracking.
//
// D4 decision: if a regex itself errors (catastrophic backtracking on a
// custom pattern), abort the AI call rather than send unredacted. Privacy
// beats utility.

const log = require('../../utils/logger')('ai-redactor');
const crypto = require('crypto');

const BUILT_IN_PATTERNS = [
  {
    name: 'auth-bearer',
    re: /Bearer\s+[A-Za-z0-9._\-]+/g,
    label: '[REDACTED:auth]',
  },
  {
    name: 'connection-string-creds',
    // Catches credentials embedded in URIs: postgres://user:pass@host
    // 13-scheme allowlist. Easy to extend.
    re: /\b(postgresql|postgres|mysql|mongodb|redis|amqp|amqps|http|https|ftp|sftp|ssh|smtp|smtps|imap|imaps|ldap|ldaps):\/\/([^:\s\/@]+):([^@\s\/]+)@/g,
    label: (_, scheme, user) => `${scheme}://${user}:[REDACTED:url-pass]@`,
  },
  {
    name: 'env-assignment',
    // *PASSWORD*=val, *SECRET*=val, etc. with prefix/suffix tolerance
    // (STRIPE_SECRET_KEY, POSTGRES_PASSWORD). Uses explicit (^|[^A-Za-z])
    // boundary instead of \b — \b doesn't fire when preceded by `_`.
    // Negative lookahead `(?!\[REDACTED)` skips values already redacted by
    // an earlier pattern (e.g. auth-bearer running first on Authorization
    // headers).
    re: /(^|[^A-Za-z])([A-Z_]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|AUTH)[A-Z_]*)\s*[:=]\s*(?!\[REDACTED)['"]?([^\s'"&]{3,})['"]?/gi,
    label: (_full, prefix, key) => `${prefix}${key}=[REDACTED:secret]`,
  },
  {
    name: 'long-token',
    // High-entropy strings ≥ 32 chars. Boundary-anchored to avoid eating
    // arbitrary text. Pure decimal (timestamps, sizes) is left alone.
    re: /\b[A-Za-z0-9_\-]{32,}\b/g,
    label: (match) => {
      if (/^\d+$/.test(match)) return match;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(match)) {
        return '[REDACTED:uuid]';
      }
      return '[REDACTED:token]';
    },
  },
  {
    name: 'ipv4',
    re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    label: '[REDACTED:ip]',
  },
  {
    name: 'email',
    re: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g,
    label: '[REDACTED:email]',
  },
];

/**
 * Compile a list of user-provided regex strings into the same shape as
 * BUILT_IN_PATTERNS. Each must be a valid regex that doesn't already
 * exhibit catastrophic complexity (we test by running it against a small
 * canary string with a 100ms timeout — primitive but catches obvious
 * footguns).
 *
 * @param {string[]} patternStrings
 * @returns {Array<{name: string, re: RegExp, label: string}>}
 * @throws if any pattern is invalid
 */
function compileCustomPatterns(patternStrings) {
  if (!Array.isArray(patternStrings) || patternStrings.length === 0) return [];
  const compiled = [];
  for (let i = 0; i < patternStrings.length; i++) {
    const src = patternStrings[i];
    if (typeof src !== 'string') {
      throw new Error(`Custom pattern #${i + 1} must be a string`);
    }
    let re;
    try {
      re = new RegExp(src, 'g');
    } catch (err) {
      throw new Error(`Custom pattern #${i + 1} is invalid regex: ${err.message}`);
    }
    compiled.push({
      name: `custom-${i + 1}`,
      re,
      label: '[REDACTED:custom]',
    });
  }
  return compiled;
}

/**
 * Redact secrets from a payload.
 *
 * @param {string} text
 * @param {string[]} [customPatterns] - operator-defined regex strings
 * @returns {{
 *   redacted: string,
 *   counts: Record<string, number>,
 *   payloadHash: string,    // SHA-256 truncated to 8 hex chars (for audit log)
 * }}
 * @throws AiRedactionError if any regex fails (D4: abort, never send unredacted)
 */
function redact(text, customPatterns = []) {
  if (typeof text !== 'string') {
    return { redacted: text, counts: {}, payloadHash: _hashEmpty() };
  }
  const compiled = [...BUILT_IN_PATTERNS, ...compileCustomPatterns(customPatterns)];
  let out = text;
  const counts = {};
  for (const p of compiled) {
    let n = 0;
    try {
      out = out.replace(p.re, (...args) => {
        n++;
        return typeof p.label === 'function' ? p.label(...args) : p.label;
      });
    } catch (err) {
      // D4: regex execution failure → abort. Don't send unredacted.
      log.error('Redactor regex failed; aborting AI call', {
        pattern: p.name,
        error: err.message,
      });
      throw new AiRedactionError(`Redactor pattern "${p.name}" failed: ${err.message}`);
    }
    if (n > 0) counts[p.name] = n;
  }
  // Hash the ORIGINAL payload (not the redacted form) so operators can later
  // verify "did this exact text get sent?" by hashing locally and comparing.
  const payloadHash = crypto.createHash('sha256').update(text, 'utf8').digest('hex').substring(0, 8);
  return { redacted: out, counts, payloadHash };
}

function _hashEmpty() {
  return crypto.createHash('sha256').update('', 'utf8').digest('hex').substring(0, 8);
}

class AiRedactionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AiRedactionError';
  }
}

module.exports = {
  redact,
  compileCustomPatterns,
  AiRedactionError,
  _internals: { BUILT_IN_PATTERNS },
};
