'use strict';

// 📚 WHY: pCloud client is the only path between Docker Dash and pCloud's
// servers. Bug here = no off-site backups for users on the free tier.

process.env.APP_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-jest-32chars';

jest.mock('https');
const https = require('https');
const { EventEmitter } = require('events');
const client = require('../services/pcloud-client');

function _makeMockResponse(jsonBody, statusCode = 200) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  // Schedule the data + end events on next tick
  process.nextTick(() => {
    res.emit('data', Buffer.from(JSON.stringify(jsonBody)));
    res.emit('end');
  });
  return res;
}

function _setupMockRequest(jsonBody, statusCode = 200) {
  const req = new EventEmitter();
  req.write = jest.fn();
  req.end = jest.fn();
  req.setTimeout = jest.fn();
  req.destroy = jest.fn();

  https.request.mockImplementation((opts, cb) => {
    // Capture the call before responding
    https.request.lastOpts = opts;
    process.nextTick(() => cb(_makeMockResponse(jsonBody, statusCode)));
    return req;
  });
  return req;
}

describe('pcloud-client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('REGIONS', () => {
    it('exposes EU and US endpoint hostnames', () => {
      expect(client.REGIONS.eu).toBe('eapi.pcloud.com');
      expect(client.REGIONS.us).toBe('api.pcloud.com');
    });
  });

  describe('obtainAuthToken', () => {
    it('returns auth token + email + quota on success', async () => {
      _setupMockRequest({ result: 0, auth: 'tok123', userid: 1, email: 'a@b', quota: 1e10, usedquota: 1e9 });
      const r = await client.obtainAuthToken({ username: 'u', password: 'p', region: 'eu' });
      expect(r.auth).toBe('tok123');
      expect(r.email).toBe('a@b');
      expect(r.quota).toBe(1e10);
    });

    it('routes to EU endpoint by default', async () => {
      _setupMockRequest({ result: 0, auth: 'x' });
      await client.obtainAuthToken({ username: 'u', password: 'p' });
      expect(https.request.lastOpts.hostname).toBe('eapi.pcloud.com');
    });

    it('routes to US endpoint when region=us', async () => {
      _setupMockRequest({ result: 0, auth: 'x' });
      await client.obtainAuthToken({ username: 'u', password: 'p', region: 'us' });
      expect(https.request.lastOpts.hostname).toBe('api.pcloud.com');
    });

    it('throws on pCloud API error code', async () => {
      _setupMockRequest({ result: 2000, error: 'Log in failed.' });
      await expect(
        client.obtainAuthToken({ username: 'u', password: 'wrong' })
      ).rejects.toThrow(/2000.*Log in failed/);
    });

    it('rejects when username or password missing', async () => {
      await expect(client.obtainAuthToken({ username: '', password: 'p' })).rejects.toThrow(/required/);
      await expect(client.obtainAuthToken({ username: 'u', password: '' })).rejects.toThrow(/required/);
    });

    it('passes logout=1 to invalidate other tokens', async () => {
      _setupMockRequest({ result: 0, auth: 'x' });
      await client.obtainAuthToken({ username: 'u', password: 'p' });
      expect(https.request.lastOpts.path).toContain('logout=1');
    });

    it('URL-encodes credentials with special chars', async () => {
      _setupMockRequest({ result: 0, auth: 'x' });
      await client.obtainAuthToken({ username: 'u@b.com', password: 'p&q?' });
      expect(https.request.lastOpts.path).toContain('username=u%40b.com');
      expect(https.request.lastOpts.path).toContain('password=p%26q%3F');
    });
  });

  describe('userInfo', () => {
    it('throws when token missing', async () => {
      await expect(client.userInfo({ region: 'eu' })).rejects.toThrow(/token required/);
    });

    it('returns quota info', async () => {
      _setupMockRequest({ result: 0, email: 'a@b', quota: 100, usedquota: 50 });
      const r = await client.userInfo({ token: 't', region: 'eu' });
      expect(r.quota).toBe(100);
    });
  });

  describe('uploadFile', () => {
    it('sends POST with multipart/form-data body', async () => {
      const req = _setupMockRequest({ result: 0, fileids: [1] });
      await client.uploadFile({
        token: 't', region: 'eu', folder: '/x', name: 'f.bin', body: Buffer.from('hi'),
      });
      expect(https.request.lastOpts.method).toBe('POST');
      expect(https.request.lastOpts.headers['Content-Type']).toMatch(/multipart\/form-data; boundary=/);
      expect(req.write).toHaveBeenCalled();
    });

    it('encodes path query parameter', async () => {
      _setupMockRequest({ result: 0 });
      await client.uploadFile({
        token: 'abc', region: 'eu', folder: '/docker-dash/db', name: 'f', body: Buffer.from('x'),
      });
      expect(https.request.lastOpts.path).toContain('auth=abc');
      expect(https.request.lastOpts.path).toContain('path=%2Fdocker-dash%2Fdb');
    });
  });

  describe('ensureFolder / listFolder / deleteFile', () => {
    it('ensureFolder calls /createfolderifnotexists', async () => {
      _setupMockRequest({ result: 0 });
      await client.ensureFolder({ token: 't', region: 'eu', path: '/foo' });
      expect(https.request.lastOpts.path).toMatch(/^\/createfolderifnotexists/);
    });

    it('listFolder calls /listfolder', async () => {
      _setupMockRequest({ result: 0, metadata: { contents: [] } });
      await client.listFolder({ token: 't', region: 'eu', path: '/foo' });
      expect(https.request.lastOpts.path).toMatch(/^\/listfolder/);
    });

    it('deleteFile calls /deletefile', async () => {
      _setupMockRequest({ result: 0 });
      await client.deleteFile({ token: 't', region: 'eu', path: '/foo/x' });
      expect(https.request.lastOpts.path).toMatch(/^\/deletefile/);
    });
  });

  describe('error handling', () => {
    it('rejects on non-JSON response', async () => {
      const req = new EventEmitter();
      req.write = jest.fn();
      req.end = jest.fn();
      req.setTimeout = jest.fn();
      req.destroy = jest.fn();

      https.request.mockImplementation((opts, cb) => {
        const res = new EventEmitter();
        res.statusCode = 502;
        process.nextTick(() => {
          cb(res);
          process.nextTick(() => {
            res.emit('data', Buffer.from('<html>Bad Gateway</html>'));
            res.emit('end');
          });
        });
        return req;
      });
      await expect(client.userInfo({ token: 't', region: 'eu' })).rejects.toThrow(/non-JSON/);
    });
  });
});
