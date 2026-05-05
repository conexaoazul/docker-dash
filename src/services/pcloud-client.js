'use strict';

// pCloud HTTP client — covers ~7 endpoints the backup feature actually uses.
// Hand-rolled (NOT pcloud-sdk-js: abandoned 2020, drags in fetch polyfills).
//
// All pCloud API responses are HTTP 200 with `{ result: <code> }` in the body.
// `result === 0` means success. Anything else is an API-level error.
// We map non-zero results to thrown Errors so callers use try/catch normally.

const https = require('https');

const REGIONS = {
  eu: 'eapi.pcloud.com',
  us: 'api.pcloud.com',
};

const DEFAULT_TIMEOUT_MS = 60000;

function _hostFor(region) {
  return REGIONS[region] || REGIONS.eu;
}

function _request({ host, method = 'GET', path, headers = {}, body = null, timeout = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      method,
      hostname: host,
      port: 443,
      path,
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString('utf8');
        let json;
        try { json = JSON.parse(text); }
        catch { return reject(new Error(`pCloud non-JSON response (HTTP ${res.statusCode}): ${text.substring(0, 200)}`)); }
        if (typeof json.result === 'number' && json.result !== 0) {
          return reject(new Error(`pCloud API error ${json.result}: ${json.error || 'unknown'}`));
        }
        resolve(json);
      });
    });
    req.on('error', reject);
    req.setTimeout(timeout, () => { req.destroy(new Error('pCloud request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function _qs(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

/**
 * Exchange username/password for a long-lived auth token.
 * Pass logout=1 to invalidate any other tokens for this account.
 */
async function obtainAuthToken({ username, password, region = 'eu' }) {
  if (!username || !password) throw new Error('username and password required');
  const path = `/userinfo?${_qs({ getauth: 1, logout: 1, username, password })}`;
  const r = await _request({ host: _hostFor(region), path });
  return {
    auth: r.auth,
    userid: r.userid,
    email: r.email,
    quota: r.quota,
    usedquota: r.usedquota,
  };
}

/** Get account info + quota for an existing token. */
async function userInfo({ token, region = 'eu' }) {
  if (!token) throw new Error('token required');
  const path = `/userinfo?${_qs({ auth: token })}`;
  return _request({ host: _hostFor(region), path });
}

/** Idempotent folder creation. pCloud returns code 2004 if folder exists — we treat that as success. */
async function ensureFolder({ token, region = 'eu', path }) {
  if (!token || !path) throw new Error('token and path required');
  const reqPath = `/createfolderifnotexists?${_qs({ auth: token, path })}`;
  return _request({ host: _hostFor(region), path: reqPath });
}

/** List folder contents. Used for retention prune. */
async function listFolder({ token, region = 'eu', path }) {
  if (!token || !path) throw new Error('token and path required');
  const reqPath = `/listfolder?${_qs({ auth: token, path })}`;
  return _request({ host: _hostFor(region), path: reqPath });
}

/** Delete a single file by full path. */
async function deleteFile({ token, region = 'eu', path }) {
  if (!token || !path) throw new Error('token and path required');
  const reqPath = `/deletefile?${_qs({ auth: token, path })}`;
  return _request({ host: _hostFor(region), path: reqPath });
}

/** Delete an empty folder. */
async function deleteFolder({ token, region = 'eu', path }) {
  if (!token || !path) throw new Error('token and path required');
  const reqPath = `/deletefolder?${_qs({ auth: token, path })}`;
  return _request({ host: _hostFor(region), path: reqPath });
}

/** Logout — invalidates the current token. */
async function logout({ token, region = 'eu' }) {
  if (!token) throw new Error('token required');
  const reqPath = `/logout?${_qs({ auth: token })}`;
  return _request({ host: _hostFor(region), path: reqPath });
}

/**
 * Upload a single file via multipart/form-data.
 * pCloud's /uploadfile expects the form field name to match the desired filename.
 */
async function uploadFile({ token, region = 'eu', folder, name, body, contentType = 'application/octet-stream', timeout = 120000 }) {
  if (!token || !folder || !name || !body) throw new Error('token, folder, name, body required');
  if (!Buffer.isBuffer(body)) body = Buffer.from(body);

  const boundary = '----dd-pcloud-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${name}"; filename="${name}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  const multipartBody = Buffer.concat([head, body, tail]);

  // renameifexists=1: if file exists, pCloud picks a new name. We want overwrite,
  // so we pass nopartial=1 and let the caller delete-before-upload when overwrite
  // semantics matter. For this use case (date-stamped files), collisions are rare.
  const path = `/uploadfile?${_qs({ auth: token, path: folder, nopartial: 1 })}`;
  return _request({
    host: _hostFor(region),
    method: 'POST',
    path,
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': multipartBody.length,
    },
    body: multipartBody,
    timeout,
  });
}

module.exports = {
  REGIONS,
  obtainAuthToken,
  userInfo,
  ensureFolder,
  listFolder,
  deleteFile,
  deleteFolder,
  logout,
  uploadFile,
};
