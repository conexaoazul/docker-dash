'use strict';

const path = require('path');

const CERT_ALLOWED_PATHS = (process.env.CERT_ALLOWED_PATHS || '/etc/letsencrypt/live,/etc/ssl/certs,/etc/ssl/private,/data/certs')
  .split(',').map(p => p.trim()).filter(Boolean);

/**
 * Check whether a certificate sourcePath is within the allowed directories.
 * @param {string} p - the path to check
 * @returns {boolean}
 */
function isAllowedCertPath(p) {
  if (!p) return false;
  const resolved = path.resolve(p);
  return CERT_ALLOWED_PATHS.some(allowed => {
    const normalised = allowed.endsWith('/') ? allowed : allowed + '/';
    return resolved === allowed || resolved.startsWith(normalised);
  });
}

module.exports = { CERT_ALLOWED_PATHS, isAllowedCertPath };
