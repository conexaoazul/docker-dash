'use strict';

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const log = require('../utils/logger')('certificates');

/**
 * Parse a PEM certificate using openssl — returns an object with
 * subject, issuer, sans, notBefore, notAfter, fingerprintSha256, selfSigned.
 */
function parsePem(pemContent) {
  if (!pemContent || typeof pemContent !== 'string') throw new Error('PEM content required');
  if (!pemContent.includes('BEGIN CERTIFICATE')) throw new Error('Not a PEM certificate');

  const tmp = path.join(os.tmpdir(), 'dd-cert-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.pem');
  fs.writeFileSync(tmp, pemContent, 'utf8');
  try {
    const text = execFileSync('openssl', ['x509', '-in', tmp, '-noout', '-subject', '-issuer', '-dates', '-fingerprint', '-sha256', '-ext', 'subjectAltName'],
      { encoding: 'utf8', timeout: 5000 });
    const info = { subject: '', issuer: '', sans: '', notBefore: '', notAfter: '', fingerprintSha256: '' };
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('subject=')) info.subject = line.substring(8).trim();
      else if (line.startsWith('issuer=')) info.issuer = line.substring(7).trim();
      else if (line.startsWith('notBefore=')) info.notBefore = line.substring(10).trim();
      else if (line.startsWith('notAfter=')) info.notAfter = line.substring(9).trim();
      else if (line.includes('Fingerprint=')) info.fingerprintSha256 = line.split('=').slice(1).join('=').trim();
      else if (line.trim().startsWith('X509v3 Subject Alternative Name')) {
        info.sans = (lines[i + 1] || '').trim();
      }
    }
    info.selfSigned = info.subject && info.subject === info.issuer;
    return info;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
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
