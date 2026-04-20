'use strict';

// Unit tests for src/services/egress-blocklog-ingester.js (v6.7.0-rc1).
// Mocks the docker API for the exec stream; uses the real DB for insert round-trip.

process.env.APP_SECRET = 'test-secret-for-ingester';
process.env.APP_ENV = 'test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'IngesterTest123!';
process.env.DD_EGRESS_POLICY_PATH = require('os').tmpdir() + '/dd-ingest-test-' + Date.now() + '/policy.json';

const { getDb } = require('../db');
getDb();

// Mock docker BEFORE loading the ingester
jest.mock('../services/docker', () => {
  const execStream = {
    handlers: {},
    on(ev, cb) { this.handlers[ev] = cb; return this; },
    _emit(ev, ...args) { if (this.handlers[ev]) this.handlers[ev](...args); return this; },
  };
  const mockContainer = {
    inspect: jest.fn(),
    exec: jest.fn(),
  };
  const mockDocker = {
    getContainer: jest.fn().mockReturnValue(mockContainer),
  };
  return {
    getDocker: jest.fn().mockReturnValue(mockDocker),
    _mock: { mockDocker, mockContainer, execStream },
  };
});

const ingester = require('../services/egress-blocklog-ingester');
const egressFilter = require('../services/egress-filter');
const dockerService = require('../services/docker');

beforeEach(() => {
  getDb().prepare('DELETE FROM egress_block_log').run();
  getDb().prepare('DELETE FROM egress_policies').run();
  ingester.stop();  // clear offsets
  dockerService._mock.mockContainer.inspect.mockReset();
  dockerService._mock.mockContainer.exec.mockReset();
});

// ─── Parser ───────────────────────────────────────

describe('parseLine', () => {
  const { parseLine } = ingester._internals;

  it('parses the sidecar line format', () => {
    const r = parseLine('2026-04-20T12:38:27Z host=example.com port=443 reason=not-in-allowlist');
    expect(r).toEqual({ timestamp: '2026-04-20T12:38:27Z', hostname: 'example.com', port: 443, reason: 'not-in-allowlist' });
  });

  it('strips the Go log prefix', () => {
    const r = parseLine('2026/04/20 12:38:27 2026-04-20T12:38:27Z host=example.com port=443 reason=imds-pin');
    expect(r.hostname).toBe('example.com');
    expect(r.reason).toBe('imds-pin');
  });

  it('returns null on non-matching lines (log framing junk, errors)', () => {
    expect(parseLine('dd-egress-proxy starting: listen=:29193')).toBeNull();
    expect(parseLine('')).toBeNull();
    expect(parseLine('garbage line')).toBeNull();
  });

  it('returns null on invalid port', () => {
    expect(parseLine('2026-04-20T12:38:27Z host=x port=99999 reason=x')).toBeNull();
    expect(parseLine('2026-04-20T12:38:27Z host=x port=abc reason=x')).toBeNull();
  });
});

// ─── Tick integration ────────────────────────────

describe('_tick', () => {
  function mockExecOutput(lines) {
    const output = lines.join('\n') + '\n';
    dockerService._mock.mockContainer.exec.mockResolvedValue({
      start: () => Promise.resolve({
        on(ev, cb) {
          if (ev === 'data') setImmediate(() => cb(Buffer.from(output)));
          else if (ev === 'end') setImmediate(cb);
          return this;
        },
      }),
    });
  }

  it('returns zero when sidecar not running', async () => {
    dockerService._mock.mockContainer.inspect.mockResolvedValue({ State: { Running: false }, Id: 'abc' });
    const r = await ingester._internals._tick();
    expect(r.processed).toBe(0);
  });

  it('returns zero when sidecar not present', async () => {
    dockerService._mock.mockContainer.inspect.mockRejectedValue(new Error('no such container'));
    const r = await ingester._internals._tick();
    expect(r.processed).toBe(0);
  });

  it('ingests new lines + inserts into egress_block_log for every active policy', async () => {
    // Create 2 active policies
    egressFilter.createPolicy({ scopeType: 'stack', scopeKey: 's1', preset: 'registry-only' });
    egressFilter.createPolicy({ scopeType: 'stack', scopeKey: 's2', preset: 'lockdown' });

    dockerService._mock.mockContainer.inspect.mockResolvedValue({ State: { Running: true }, Id: 'sidecar1' });
    mockExecOutput([
      '2026-04-20T10:00:00Z host=evil.com port=443 reason=not-in-allowlist',
      '2026-04-20T10:00:01Z host=bad.io port=80 reason=not-in-allowlist',
    ]);

    const r = await ingester._internals._tick();
    expect(r.processed).toBe(2);

    // Each line should insert 2 rows (one per policy)
    const rows = getDb().prepare('SELECT policy_id, hostname, port, reason FROM egress_block_log ORDER BY id').all();
    expect(rows).toHaveLength(4);
    expect(rows.map(r => r.hostname).sort()).toEqual(['bad.io', 'bad.io', 'evil.com', 'evil.com']);
  });

  it('dedupes across ticks using last-seen timestamp', async () => {
    egressFilter.createPolicy({ scopeType: 'stack', scopeKey: 's1', preset: 'registry-only' });
    dockerService._mock.mockContainer.inspect.mockResolvedValue({ State: { Running: true }, Id: 'sidecar1' });

    mockExecOutput([
      '2026-04-20T10:00:00Z host=a.com port=443 reason=not-in-allowlist',
      '2026-04-20T10:00:01Z host=b.com port=443 reason=not-in-allowlist',
    ]);
    await ingester._internals._tick();

    // Second tick with overlapping lines (same two + one new)
    mockExecOutput([
      '2026-04-20T10:00:00Z host=a.com port=443 reason=not-in-allowlist',
      '2026-04-20T10:00:01Z host=b.com port=443 reason=not-in-allowlist',
      '2026-04-20T10:00:02Z host=c.com port=443 reason=not-in-allowlist',
    ]);
    const r = await ingester._internals._tick();
    expect(r.processed).toBe(1);  // only c.com is new
    expect(r.skipped).toBeGreaterThanOrEqual(2);

    const rows = getDb().prepare('SELECT hostname FROM egress_block_log ORDER BY id').all();
    expect(rows.map(r => r.hostname)).toEqual(['a.com', 'b.com', 'c.com']);
  });

  it('resets offset on sidecar container id change (restart)', async () => {
    egressFilter.createPolicy({ scopeType: 'stack', scopeKey: 's1', preset: 'registry-only' });

    dockerService._mock.mockContainer.inspect.mockResolvedValueOnce({ State: { Running: true }, Id: 'sidecar1' });
    mockExecOutput([
      '2026-04-20T10:00:00Z host=a.com port=443 reason=not-in-allowlist',
    ]);
    await ingester._internals._tick();

    // Sidecar restarted → new container id
    dockerService._mock.mockContainer.inspect.mockResolvedValueOnce({ State: { Running: true }, Id: 'sidecar2' });
    mockExecOutput([
      '2026-04-20T10:00:00Z host=a.com port=443 reason=not-in-allowlist',  // reappears, but new CID → ingested again
    ]);
    const r = await ingester._internals._tick();
    expect(r.processed).toBe(1);
  });

  it('skips junk lines without aborting', async () => {
    egressFilter.createPolicy({ scopeType: 'stack', scopeKey: 's1', preset: 'registry-only' });
    dockerService._mock.mockContainer.inspect.mockResolvedValue({ State: { Running: true }, Id: 'sidecar1' });
    mockExecOutput([
      'dd-egress-proxy starting',
      '2026-04-20T10:00:00Z host=real.com port=443 reason=not-in-allowlist',
      'garbage',
      '',
    ]);
    const r = await ingester._internals._tick();
    expect(r.processed).toBe(1);
    expect(r.skipped).toBeGreaterThanOrEqual(2);
  });

  it('no-op when no active policies exist', async () => {
    dockerService._mock.mockContainer.inspect.mockResolvedValue({ State: { Running: true }, Id: 'sidecar1' });
    mockExecOutput([
      '2026-04-20T10:00:00Z host=real.com port=443 reason=not-in-allowlist',
    ]);
    const r = await ingester._internals._tick();
    // processed=1 in intent but no rows because no policies
    expect(r.processed).toBe(1);
    const rows = getDb().prepare('SELECT COUNT(*) as n FROM egress_block_log').get();
    expect(rows.n).toBe(0);
  });
});
