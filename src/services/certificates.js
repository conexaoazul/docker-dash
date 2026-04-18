'use strict';

const { execFileSync } = require('child_process');
const { X509Certificate, createHash } = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('../utils/logger')('certificates');

/**
 * Parse a PEM certificate using Node's built-in crypto.X509Certificate — returns an object with
 * subject, issuer, sans, notBefore, notAfter, fingerprintSha256, selfSigned.
 * No temp files, no shell-out — safe and fast.
 */
function parsePem(pemContent) {
  if (!pemContent || typeof pemContent !== 'string') throw new Error('PEM content required');
  if (!pemContent.includes('BEGIN CERTIFICATE')) throw new Error('Not a PEM certificate');

  const cert = new X509Certificate(pemContent);
  const fp = createHash('sha256')
    .update(cert.raw)
    .digest('hex')
    .match(/.{2}/g)
    .join(':')
    .toUpperCase();

  return {
    subject: cert.subject.replace(/\n/g, ', '),
    issuer: cert.issuer.replace(/\n/g, ', '),
    sans: cert.subjectAltName || '',
    notBefore: cert.validFrom,
    notAfter: cert.validTo,
    fingerprintSha256: 'SHA256 Fingerprint=' + fp,
    selfSigned: cert.subject === cert.issuer,
  };
}

/**
 * Generate a private key + CSR. keyType: 'rsa' (default, 4096-bit) or 'ec' (P-256).
 * Returns { privateKey, csr }. Uses openssl.
 */
function generateCsr({ commonName, organization = '', organizationalUnit = '', country = 'US', state = '', locality = '', emailAddress = '', sans = [], keyType = 'rsa' } = {}) {
  if (!commonName) throw new Error('commonName required');

  const confPath = path.join(os.tmpdir(), 'dd-csr-' + Date.now() + '.cnf');
  const keyPath = path.join(os.tmpdir(), 'dd-csr-' + Date.now() + '.key');
  const csrPath = path.join(os.tmpdir(), 'dd-csr-' + Date.now() + '.csr');

  const sanLines = (Array.isArray(sans) ? sans : String(sans).split(','))
    .map(s => String(s).trim()).filter(Boolean);
  const sanBlock = sanLines.length > 0
    ? '[req_ext]\nsubjectAltName = @alt_names\n[alt_names]\n' + sanLines.map((s, i) => {
        if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return 'IP.' + (i + 1) + ' = ' + s;
        return 'DNS.' + (i + 1) + ' = ' + s;
      }).join('\n')
    : '';

  const conf = [
    '[req]',
    'default_bits = 4096',
    'prompt = no',
    'distinguished_name = dn',
    sanLines.length > 0 ? 'req_extensions = req_ext' : '',
    '[dn]',
    country ? 'C = ' + country : '',
    state ? 'ST = ' + state : '',
    locality ? 'L = ' + locality : '',
    organization ? 'O = ' + organization : '',
    organizationalUnit ? 'OU = ' + organizationalUnit : '',
    'CN = ' + commonName,
    emailAddress ? 'emailAddress = ' + emailAddress : '',
    sanBlock,
  ].filter(Boolean).join('\n');

  fs.writeFileSync(confPath, conf, 'utf8');

  try {
    if (keyType === 'ec') {
      execFileSync('openssl', ['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', keyPath], { timeout: 10000 });
    } else {
      execFileSync('openssl', ['genrsa', '-out', keyPath, '4096'], { timeout: 20000 });
    }

    execFileSync('openssl', ['req', '-new', '-key', keyPath, '-out', csrPath, '-config', confPath],
      { timeout: 10000, encoding: 'utf8' });

    const privateKey = fs.readFileSync(keyPath, 'utf8');
    const csr = fs.readFileSync(csrPath, 'utf8');
    return { privateKey, csr };
  } finally {
    try { fs.unlinkSync(confPath); } catch {}
    try { fs.unlinkSync(keyPath); } catch {}
    try { fs.unlinkSync(csrPath); } catch {}
  }
}

/**
 * Compute days until expiry for a parsed notAfter date string.
 */
function daysUntil(notAfter) {
  if (!notAfter) return null;
  const d = new Date(notAfter).getTime();
  if (!Number.isFinite(d)) return null;
  return Math.floor((d - Date.now()) / 86400000);
}

function statusForDays(days) {
  if (days == null) return 'unknown';
  if (days < 0) return 'expired';
  if (days <= 7) return 'critical';
  if (days <= 30) return 'warning';
  return 'ok';
}

module.exports = { parsePem, generateCsr, daysUntil, statusForDays };
