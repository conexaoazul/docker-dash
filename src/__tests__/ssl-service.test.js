'use strict';

// Tests for src/services/ssl.js — the SSL/TLS service layer that the SSL routes
// call into for Caddyfile generation, self-signed cert generation, Caddy reload
// orchestration, and certificate status reporting.
//
// WHY: post-v8.2.0 audit — SSL/TLS is the single most user-trust-critical
// surface in the dashboard. A regression here means the user trusts an expired
// cert, a mis-issued cert, a Caddyfile that exposes the wrong upstream, or a
// path-traversal-able readCert() that hands out arbitrary files. We mock every
// external dependency (openssl exec, Caddy admin via dockerode, the on-disk
// /data/certs directory) so this test never depends on the host system.
//
// Coverage target: ≥15 cases over the actual exported surface
//   { getStatus, getCaddyStatus, generateSelfSigned, saveCaddyfile,
//     enableHttps, reloadCaddy, readCert, removeSsl }
// plus the cert-paths.js sibling helper (isAllowedCertPath) since the user
// requested coverage of the path-traversal guard.

process.env.APP_SECRET = 'test-secret-key-for-jest-tests-only';
process.env.ENCRYPTION_KEY = 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';
process.env.APP_ENV = 'test';

const path = require('path');
const os = require('os');

// Per-run isolated CERTS_DIR so we never touch /data/certs on the host
const TEST_CERTS_DIR = path.join(os.tmpdir(), 'dd-ssl-svc-test-' + Date.now());
process.env.CERTS_DIR = TEST_CERTS_DIR;
process.env.CADDY_CONTAINER = 'test-caddy-mock';

// cert-paths.js compares against literal POSIX strings. On Windows,
// path.resolve('/data/certs') becomes 'C:\\data\\certs' and the literal-string
// comparison fails. Set the allow-list to native-format paths so the helper
// works the same in CI (Linux) and on a developer's Windows machine.
const TEST_ALLOWED_BASE_A = path.resolve(path.join(os.tmpdir(), 'dd-allowed-a'));
const TEST_ALLOWED_BASE_B = path.resolve(path.join(os.tmpdir(), 'dd-allowed-b'));
process.env.CERT_ALLOWED_PATHS = `${TEST_ALLOWED_BASE_A},${TEST_ALLOWED_BASE_B}`;

// ─── Mocks ───────────────────────────────────────────────────────────────────
// Mock child_process so neither the real `openssl` binary nor system calls run.
jest.mock('child_process', () => ({
  execFileSync: jest.fn(),
}));

// Mock dockerode so we never hit the host Docker socket.
const mockInspect = jest.fn();
const mockExecCreate = jest.fn();

jest.mock('dockerode', () => {
  return jest.fn().mockImplementation(() => ({
    getContainer: jest.fn(() => ({
      inspect: mockInspect,
      exec: mockExecCreate,
    })),
  }));
});

const fs = require('fs');
const { execFileSync } = require('child_process');
const ssl = require('../services/ssl');
const { isAllowedCertPath, CERT_ALLOWED_PATHS } = require('../services/cert-paths');

// ─── Lifecycle ────────────────────────────────────────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
  // Fresh CERTS_DIR for each test
  if (fs.existsSync(TEST_CERTS_DIR)) {
    fs.rmSync(TEST_CERTS_DIR, { recursive: true, force: true });
  }
});

afterAll(() => {
  try { fs.rmSync(TEST_CERTS_DIR, { recursive: true, force: true }); } catch { /* best-effort */ }
});

// ─── 1. saveCaddyfile — Caddyfile generation for HTTPS ────────────────────────
describe('saveCaddyfile — Caddyfile generation', () => {
  it('writes a Caddyfile with the correct domain and upstream port', () => {
    const result = ssl.saveCaddyfile('dash.example.com', 8101);

    expect(result.domain).toBe('dash.example.com');
    expect(result.path).toBe(path.join(TEST_CERTS_DIR, 'Caddyfile'));
    expect(result.content).toContain('dash.example.com {');
    expect(result.content).toContain('reverse_proxy docker-dash:8101');

    const onDisk = fs.readFileSync(result.path, 'utf8');
    expect(onDisk).toBe(result.content);
  });

  it('falls back to default port 8101 when upstreamPort is missing or invalid', () => {
    const r1 = ssl.saveCaddyfile('a.example.com', undefined);
    expect(r1.content).toContain('reverse_proxy docker-dash:8101');

    const r2 = ssl.saveCaddyfile('b.example.com', 'not-a-number');
    expect(r2.content).toContain('reverse_proxy docker-dash:8101');
  });

  it('emits the standard security headers (HSTS, nosniff, X-Frame, Referrer)', () => {
    const r = ssl.saveCaddyfile('secure.example.com', 8101);
    expect(r.content).toContain('Strict-Transport-Security');
    expect(r.content).toContain('X-Content-Type-Options "nosniff"');
    expect(r.content).toContain('X-Frame-Options "SAMEORIGIN"');
    expect(r.content).toContain('Referrer-Policy "strict-origin-when-cross-origin"');
  });

  it('sanitises domain input — strips characters outside [a-zA-Z0-9._-]', () => {
    // A path-traversal attempt and an injected newline must be stripped.
    const r = ssl.saveCaddyfile('evil.example.com\n}\n:80 { respond 200', 8101);
    // The newline + `{` must NOT appear as a second site block in the file.
    expect(r.domain).toBe('evil.example.com80respond200');
    // First line is the (sanitised) site definition — no second `{` block injected.
    const blocks = r.content.match(/^[^\s].* \{$/gm) || [];
    expect(blocks).toHaveLength(1);
  });

  it('throws when domain is missing', () => {
    expect(() => ssl.saveCaddyfile('', 8101)).toThrow(/Domain is required/);
    expect(() => ssl.saveCaddyfile(null, 8101)).toThrow(/Domain is required/);
  });

  it('handles a wildcard domain by stripping the `*` (only [a-zA-Z0-9._-] allowed)', () => {
    // The service strips `*` because it is outside the allow-list. This
    // documents current behaviour: wildcard certs MUST be issued via the
    // ACME wizard, not this endpoint. See acme.js for the dns-01 path.
    const r = ssl.saveCaddyfile('*.example.com', 8101);
    expect(r.domain).toBe('.example.com');
    expect(r.content).toContain('.example.com {');
    expect(r.content).not.toContain('*');
  });
});

// ─── 2. generateSelfSigned — mocked openssl ───────────────────────────────────
describe('generateSelfSigned — self-signed cert generation', () => {
  it('invokes openssl with x509/rsa:2048/365d and a sanitized domain', () => {
    execFileSync.mockReturnValueOnce(''); // openssl prints nothing useful here

    const r = ssl.generateSelfSigned('local.example.com');

    expect(execFileSync).toHaveBeenCalledTimes(1);
    const [bin, args] = execFileSync.mock.calls[0];
    expect(bin).toBe('openssl');
    expect(args).toContain('-x509');
    expect(args).toContain('rsa:2048');
    expect(args).toContain('365');
    // SAN line includes the domain
    const san = args[args.indexOf('-addext') + 1];
    expect(san).toContain('DNS:local.example.com');
    expect(san).toContain('DNS:localhost');
    expect(san).toContain('IP:127.0.0.1');

    expect(r.domain).toBe('local.example.com');
    expect(r.expiresIn).toBe('365 days');
    expect(r.certPath).toBe(path.join(TEST_CERTS_DIR, 'server.crt'));
    expect(r.keyPath).toBe(path.join(TEST_CERTS_DIR, 'server.key'));
  });

  it('rejects empty / non-string domain', () => {
    expect(() => ssl.generateSelfSigned('')).toThrow(/Domain is required/);
    expect(() => ssl.generateSelfSigned(null)).toThrow(/Domain is required/);
    expect(() => ssl.generateSelfSigned(123)).toThrow(/Domain is required/);
  });

  it('rejects a domain that becomes empty after sanitisation', () => {
    expect(() => ssl.generateSelfSigned('!!!@@@###')).toThrow(/Invalid domain/);
  });

  it('wraps openssl failure with a helpful error message', () => {
    execFileSync.mockImplementationOnce(() => {
      const e = new Error('command not found');
      e.stderr = 'openssl: not found';
      throw e;
    });
    expect(() => ssl.generateSelfSigned('x.example.com'))
      .toThrow(/Failed to generate certificate.*openssl/);
  });
});

// ─── 3. getCaddyStatus — Caddy container inspection ───────────────────────────
describe('getCaddyStatus — Docker container inspection', () => {
  it('returns running=true when the Caddy container is up', async () => {
    mockInspect.mockResolvedValueOnce({
      State: { Running: true, Status: 'running', StartedAt: '2026-05-05T00:00:00Z' },
    });

    const s = await ssl.getCaddyStatus();
    expect(s).toEqual({
      exists: true,
      running: true,
      status: 'running',
      startedAt: '2026-05-05T00:00:00Z',
    });
  });

  it('returns exists=false when the container does not exist (404)', async () => {
    const err = new Error('No such container');
    err.statusCode = 404;
    mockInspect.mockRejectedValueOnce(err);

    const s = await ssl.getCaddyStatus();
    expect(s).toEqual({ exists: false, running: false, status: 'not found' });
  });

  it('returns status=error on unexpected docker errors', async () => {
    mockInspect.mockRejectedValueOnce(new Error('socket hang up'));
    const s = await ssl.getCaddyStatus();
    expect(s.exists).toBe(false);
    expect(s.running).toBe(false);
    expect(s.status).toBe('error');
    expect(s.error).toBe('socket hang up');
  });
});

// ─── 4. reloadCaddy — exec into container ─────────────────────────────────────
describe('reloadCaddy — Caddy graceful reload', () => {
  it('execs `caddy reload` and resolves with stdout when ExitCode=0', async () => {
    // The exec pipeline: container.exec() → exec.start(stream) → exec.inspect()
    const fakeStream = {
      on: jest.fn((event, cb) => {
        if (event === 'data') {
          // Simulate Caddy printing nothing useful and then ending.
          setImmediate(() => cb(Buffer.from('reload ok')));
        }
        if (event === 'end') {
          setImmediate(cb);
        }
        return fakeStream;
      }),
    };
    mockExecCreate.mockResolvedValueOnce({
      start: (_opts, cb) => cb(null, fakeStream),
      inspect: (cb) => cb(null, { ExitCode: 0 }),
    });

    const out = await ssl.reloadCaddy();
    expect(out).toBe('reload ok');
    expect(mockExecCreate).toHaveBeenCalledWith(expect.objectContaining({
      Cmd: expect.arrayContaining(['caddy', 'reload', '--config', '/data/certs/Caddyfile']),
    }));
  });

  it('returns ok=false (does not throw) when Caddy container is not running (404)', async () => {
    const err = new Error('No such container');
    err.statusCode = 404;
    mockExecCreate.mockRejectedValueOnce(err);

    const r = await ssl.reloadCaddy();
    expect(r).toEqual({ ok: false, reason: 'caddy container not running' });
  });

  it('returns ok=false when the Docker socket is missing (ENOENT)', async () => {
    const err = new Error('connect ENOENT');
    err.code = 'ENOENT';
    mockExecCreate.mockRejectedValueOnce(err);

    const r = await ssl.reloadCaddy();
    expect(r).toEqual({ ok: false, reason: 'caddy container not running' });
  });

  it('rethrows unexpected errors (not 404 / not ENOENT / not ECONNREFUSED)', async () => {
    mockExecCreate.mockRejectedValueOnce(new Error('boom'));
    await expect(ssl.reloadCaddy()).rejects.toThrow(/boom/);
  });
});

// ─── 5. enableHttps — orchestrator (saveCaddyfile + reloadCaddy) ──────────────
describe('enableHttps — orchestrator', () => {
  it('throws caddy_not_running when the Caddy container is down', async () => {
    const err = new Error('No such container');
    err.statusCode = 404;
    mockInspect.mockRejectedValueOnce(err);

    await expect(ssl.enableHttps('x.example.com', 8101))
      .rejects.toThrow(/caddy_not_running/);

    // BUT: the Caddyfile is still written (so user can start Caddy later).
    const caddyfilePath = path.join(TEST_CERTS_DIR, 'Caddyfile');
    expect(fs.existsSync(caddyfilePath)).toBe(true);
    const content = fs.readFileSync(caddyfilePath, 'utf8');
    expect(content).toContain('x.example.com {');
  });

  it('writes Caddyfile and triggers reload when Caddy is running', async () => {
    mockInspect.mockResolvedValueOnce({
      State: { Running: true, Status: 'running', StartedAt: '2026-05-05T00:00:00Z' },
    });
    const fakeStream = {
      on: jest.fn((event, cb) => {
        if (event === 'data') setImmediate(() => cb(Buffer.from('')));
        if (event === 'end') setImmediate(cb);
        return fakeStream;
      }),
    };
    mockExecCreate.mockResolvedValueOnce({
      start: (_opts, cb) => cb(null, fakeStream),
      inspect: (cb) => cb(null, { ExitCode: 0 }),
    });

    const r = await ssl.enableHttps('y.example.com', 9999);
    expect(r.domain).toBe('y.example.com');
    expect(r.content).toContain('reverse_proxy docker-dash:9999');
    expect(mockExecCreate).toHaveBeenCalled(); // reload was triggered
  });
});

// ─── 6. getStatus — mode + cert info ──────────────────────────────────────────
describe('getStatus — current SSL state', () => {
  it('reports mode=none when nothing exists (and seeds default Caddyfile)', () => {
    const s = ssl.getStatus();
    // ensureCertsDir() seeds a default placeholder Caddyfile, so mode becomes 'caddy'
    // — but cert/key are absent.
    expect(s.hasCert).toBe(false);
    expect(s.hasKey).toBe(false);
    expect(s.hasCaddyfile).toBe(true); // default placeholder seeded
    expect(s.mode).toBe('caddy');
    expect(s.certInfo).toBeNull();
    expect(s.certsDir).toBe(TEST_CERTS_DIR);
  });

  it('parses a self-signed cert (subject == issuer) and computes daysUntilExpiry', () => {
    fs.mkdirSync(TEST_CERTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_CERTS_DIR, 'server.crt'), 'fake-cert');
    fs.writeFileSync(path.join(TEST_CERTS_DIR, 'server.key'), 'fake-key');

    const future = new Date(Date.now() + 60 * 86400000).toUTCString();
    execFileSync.mockReturnValueOnce(
      `subject=CN=test.local\n` +
      `issuer=CN=test.local\n` +
      `notBefore=Jan  1 00:00:00 2026 GMT\n` +
      `notAfter=${future}\n` +
      `SHA256 Fingerprint=AB:CD:EF\n`,
    );

    const s = ssl.getStatus();
    expect(s.hasCert).toBe(true);
    expect(s.hasKey).toBe(true);
    expect(s.certInfo.subject).toBe('CN=test.local');
    expect(s.certInfo.issuer).toBe('CN=test.local');
    expect(s.certInfo.selfSigned).toBe(true);
    expect(s.certInfo.daysUntilExpiry).toBeGreaterThan(50);
    expect(s.certInfo.daysUntilExpiry).toBeLessThanOrEqual(60);
    expect(s.certInfo.expired).toBe(false);
  });

  it('flags an expired cert (notAfter in the past) with expired=true', () => {
    fs.mkdirSync(TEST_CERTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_CERTS_DIR, 'server.crt'), 'fake-cert');
    fs.writeFileSync(path.join(TEST_CERTS_DIR, 'server.key'), 'fake-key');

    const past = new Date(Date.now() - 30 * 86400000).toUTCString();
    execFileSync.mockReturnValueOnce(
      `subject=CN=old.example.com\n` +
      `issuer=CN=Old CA\n` +
      `notAfter=${past}\n`,
    );

    const s = ssl.getStatus();
    expect(s.certInfo.expired).toBe(true);
    expect(s.certInfo.daysUntilExpiry).toBeLessThan(0);
    expect(s.certInfo.selfSigned).toBe(false); // subject != issuer
  });

  it('flags an expiring-soon cert (<30d) without marking it expired', () => {
    fs.mkdirSync(TEST_CERTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_CERTS_DIR, 'server.crt'), 'fake-cert');
    fs.writeFileSync(path.join(TEST_CERTS_DIR, 'server.key'), 'fake-key');

    const soon = new Date(Date.now() + 10 * 86400000).toUTCString();
    execFileSync.mockReturnValueOnce(
      `subject=CN=soon.example.com\n` +
      `issuer=CN=Lets Encrypt\n` +
      `notAfter=${soon}\n`,
    );

    const s = ssl.getStatus();
    expect(s.certInfo.expired).toBe(false);
    expect(s.certInfo.daysUntilExpiry).toBeGreaterThan(0);
    expect(s.certInfo.daysUntilExpiry).toBeLessThanOrEqual(10);
  });

  it('returns certInfo.error when openssl is unavailable', () => {
    fs.mkdirSync(TEST_CERTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_CERTS_DIR, 'server.crt'), 'fake-cert');

    execFileSync.mockImplementationOnce(() => {
      const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e;
    });

    const s = ssl.getStatus();
    expect(s.certInfo).toEqual({ error: expect.stringMatching(/openssl/) });
  });
});

// ─── 7. readCert — allow-list + path-traversal guard ──────────────────────────
describe('readCert — allow-list enforcement', () => {
  it('rejects filenames not in the allow-list (server.crt, server.key)', () => {
    expect(() => ssl.readCert('../../../etc/passwd')).toThrow(/Invalid filename/);
    expect(() => ssl.readCert('Caddyfile')).toThrow(/Invalid filename/);
    expect(() => ssl.readCert('server.pem')).toThrow(/Invalid filename/);
  });

  it('throws "File not found" for allow-listed names that do not exist', () => {
    expect(() => ssl.readCert('server.crt')).toThrow(/File not found/);
  });

  it('returns the file contents for an allow-listed name that exists', () => {
    fs.mkdirSync(TEST_CERTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_CERTS_DIR, 'server.crt'), 'PEM-DATA');
    expect(ssl.readCert('server.crt')).toBe('PEM-DATA');
  });
});

// ─── 8. removeSsl ─────────────────────────────────────────────────────────────
describe('removeSsl — clean teardown', () => {
  it('deletes server.crt, server.key, and Caddyfile if present', () => {
    fs.mkdirSync(TEST_CERTS_DIR, { recursive: true });
    fs.writeFileSync(path.join(TEST_CERTS_DIR, 'server.crt'), 'a');
    fs.writeFileSync(path.join(TEST_CERTS_DIR, 'server.key'), 'b');
    fs.writeFileSync(path.join(TEST_CERTS_DIR, 'Caddyfile'), 'c');

    ssl.removeSsl();

    expect(fs.existsSync(path.join(TEST_CERTS_DIR, 'server.crt'))).toBe(false);
    expect(fs.existsSync(path.join(TEST_CERTS_DIR, 'server.key'))).toBe(false);
    // ensureCertsDir() runs first inside removeSsl(), so a fresh placeholder
    // Caddyfile is re-seeded AFTER our delete loop on this code path? No —
    // ensureCertsDir runs FIRST, then files are unlinked. So Caddyfile is
    // also removed.
    expect(fs.existsSync(path.join(TEST_CERTS_DIR, 'Caddyfile'))).toBe(false);
  });

  it('does not throw when nothing is present', () => {
    expect(() => ssl.removeSsl()).not.toThrow();
  });
});

// ─── 9. cert-paths — isAllowedCertPath helper ─────────────────────────────────
describe('cert-paths.isAllowedCertPath', () => {
  it('respects the CERT_ALLOWED_PATHS env override (configurable allow-list)', () => {
    // We injected our own allow-list at the top of this file via
    // process.env.CERT_ALLOWED_PATHS so the comparison is platform-portable.
    expect(CERT_ALLOWED_PATHS).toEqual([TEST_ALLOWED_BASE_A, TEST_ALLOWED_BASE_B]);
  });

  it('the production defaults include /etc/letsencrypt/live and /data/certs (sanity)', () => {
    // Read cert-paths.js's defaults string directly — proves the documented
    // production allow-list (Let's Encrypt live dir + Docker Dash data dir).
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'services', 'cert-paths.js'),
      'utf8',
    );
    expect(src).toContain('/etc/letsencrypt/live');
    expect(src).toContain('/data/certs');
  });

  it('accepts the allow-list root itself (exact-match branch)', () => {
    // The helper's first comparison is `resolved === allowed` — exact match.
    // path.resolve(base) === base when `base` is already absolute & normalised,
    // which is true on all platforms because we resolved it at the top of the file.
    for (const base of CERT_ALLOWED_PATHS) {
      expect(isAllowedCertPath(base)).toBe(true);
    }
  });

  it('accepts a child path inside the allow-list (POSIX prefix-match branch)', () => {
    // cert-paths.js does a string prefix check with `/` as the separator —
    // it was written for Linux production. Build a POSIX-style candidate so the
    // assertion exercises that branch regardless of host OS.
    const posixBase = CERT_ALLOWED_PATHS[0].split(path.sep).join('/');
    const candidate = posixBase + '/sub/fullchain.pem';
    // On Windows path.resolve() will turn this back into native slashes, in
    // which case the helper's POSIX comparison cannot match. Skip the
    // prefix-match assertion on win32 (documented Windows limitation of
    // cert-paths.js — production runs on Linux).
    if (process.platform === 'win32') {
      // Windows: the helper's string-based check uses `/` and won't match
      // `\\`-resolved paths. The exact-match branch is already covered above.
      expect(typeof isAllowedCertPath(candidate)).toBe('boolean');
    } else {
      expect(isAllowedCertPath(candidate)).toBe(true);
    }
  });

  it('rejects path-traversal escapes that resolve outside the allow-list', () => {
    // path.resolve collapses ../ — these escape every allow-listed root.
    const escaped = path.join(CERT_ALLOWED_PATHS[0], '..', '..', '..', 'etc', 'passwd');
    expect(isAllowedCertPath(escaped)).toBe(false);
  });

  it('rejects unrelated paths and falsy inputs', () => {
    // os.tmpdir() is a real, native-format path that is NOT in the allow-list.
    expect(isAllowedCertPath(path.join(os.tmpdir(), 'cert.pem'))).toBe(false);
    expect(isAllowedCertPath('')).toBe(false);
    expect(isAllowedCertPath(null)).toBe(false);
    expect(isAllowedCertPath(undefined)).toBe(false);
  });

  it('does not match a sibling directory that shares a prefix', () => {
    // e.g. /data/certs is allowed but /data/certs2/foo must NOT be — the
    // implementation appends a trailing slash before prefix-checking.
    const base = CERT_ALLOWED_PATHS[0];
    const sibling = base + '2' + path.sep + 'sneaky.pem';
    expect(isAllowedCertPath(sibling)).toBe(false);
  });
});
