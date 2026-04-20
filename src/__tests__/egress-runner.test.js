'use strict';

// Unit tests for src/services/egress-runner.js (v6.7.0-alpha.3).
// Mocks the docker API — we're testing the orchestration logic, not the
// actual nftables install (P1 preflight already validated the mechanism).

process.env.APP_SECRET = 'test-secret-for-egress-runner';
process.env.APP_ENV = 'test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'EgressRunnerTest123!';
process.env.DD_EGRESS_SIDECAR_ENDPOINT = '172.17.0.99:29193';

// Mock the docker service so we don't need a real daemon.
jest.mock('../services/docker', () => {
  const mockContainer = {
    start: jest.fn().mockResolvedValue(),
    wait: jest.fn().mockResolvedValue({ StatusCode: 0 }),
    remove: jest.fn().mockResolvedValue(),
    logs: jest.fn().mockResolvedValue({
      on: jest.fn(function (ev, cb) {
        if (ev === 'end') setImmediate(cb);
        return this;
      }),
    }),
  };
  const mockDocker = {
    createContainer: jest.fn().mockResolvedValue(mockContainer),
    getContainer: jest.fn().mockReturnValue({
      inspect: jest.fn().mockResolvedValue({
        State: { Running: true },
        HostConfig: { NetworkMode: 'bridge', CapAdd: [], Privileged: false },
      }),
    }),
  };
  return {
    getDocker: jest.fn().mockReturnValue(mockDocker),
    _mock: { mockContainer, mockDocker },
  };
});

const dockerService = require('../services/docker');
const runner = require('../services/egress-runner');

beforeEach(() => {
  dockerService._mock.mockDocker.createContainer.mockClear();
  dockerService._mock.mockContainer.start.mockClear();
  dockerService._mock.mockContainer.wait.mockReset().mockResolvedValue({ StatusCode: 0 });
  dockerService._mock.mockContainer.remove.mockClear();
});

// ─── Config / env validation ──────────────────────────

describe('_sidecarEndpoint', () => {
  const { _sidecarEndpoint } = runner._internals;

  it('parses ip:port from env', () => {
    const r = _sidecarEndpoint();
    expect(r).toEqual({ ip: '172.17.0.99', port: 29193 });
  });

  it('throws when env unset', () => {
    const old = process.env.DD_EGRESS_SIDECAR_ENDPOINT;
    delete process.env.DD_EGRESS_SIDECAR_ENDPOINT;
    expect(() => _sidecarEndpoint()).toThrow(/DD_EGRESS_SIDECAR_ENDPOINT/);
    process.env.DD_EGRESS_SIDECAR_ENDPOINT = old;
  });

  it('throws on bad format', () => {
    const old = process.env.DD_EGRESS_SIDECAR_ENDPOINT;
    process.env.DD_EGRESS_SIDECAR_ENDPOINT = 'not-an-endpoint';
    expect(() => _sidecarEndpoint()).toThrow(/ip:port/);
    process.env.DD_EGRESS_SIDECAR_ENDPOINT = old;
  });

  it('throws when port is missing', () => {
    const old = process.env.DD_EGRESS_SIDECAR_ENDPOINT;
    process.env.DD_EGRESS_SIDECAR_ENDPOINT = '172.17.0.99';
    expect(() => _sidecarEndpoint()).toThrow(/ip:port/);
    process.env.DD_EGRESS_SIDECAR_ENDPOINT = old;
  });
});

// ─── Apply/remove scripts produce the right commands ──

describe('_applyScript / _removeScript / _inspectScript', () => {
  const { _applyScript, _removeScript, _inspectScript } = runner._internals;

  it('_applyScript embeds sidecar ip:port + accepts DNS/loopback/RFC1918', () => {
    const s = _applyScript('10.0.0.5', 29193);
    expect(s).toContain('ip daddr 10.0.0.5 tcp dport 29193 return');
    expect(s).toContain('udp dport 53 return');
    expect(s).toContain('oifname "lo" return');
    expect(s).toContain('ip daddr 10.0.0.0/8 return');
    expect(s).toContain('dnat to 10.0.0.5:29193');
  });

  it('_applyScript is idempotent (deletes old table first)', () => {
    expect(_applyScript('10.0.0.5', 29193)).toMatch(/nft delete table ip ddout.*\|\| true/);
  });

  it('_removeScript flushes ip ddout', () => {
    expect(_removeScript()).toMatch(/nft delete table ip ddout.*\|\| true/);
  });

  it('_inspectScript reports APPLIED or NOT_APPLIED', () => {
    expect(_inspectScript()).toMatch(/APPLIED/);
    expect(_inspectScript()).toMatch(/NOT_APPLIED/);
  });
});

// ─── applyToContainer / removeFromContainer / isApplied ──

describe('applyToContainer', () => {
  it('rejects when containerId missing', async () => {
    await expect(runner.applyToContainer({ })).rejects.toThrow(/containerId required/);
  });

  it('creates helper with NET_ADMIN + --network container:<target>', async () => {
    await runner.applyToContainer({ containerId: 'abc123' });
    const call = dockerService._mock.mockDocker.createContainer.mock.calls[0][0];
    expect(call.HostConfig.CapAdd).toContain('NET_ADMIN');
    expect(call.HostConfig.NetworkMode).toBe('container:abc123');
  });

  it('removes helper after successful run', async () => {
    await runner.applyToContainer({ containerId: 'abc123' });
    expect(dockerService._mock.mockContainer.remove).toHaveBeenCalled();
  });

  it('throws + still cleans up when helper exits non-zero', async () => {
    dockerService._mock.mockContainer.wait.mockResolvedValueOnce({ StatusCode: 1 });
    await expect(runner.applyToContainer({ containerId: 'abc123' })).rejects.toThrow(/exited 1/);
    expect(dockerService._mock.mockContainer.remove).toHaveBeenCalled();
  });
});

describe('removeFromContainer', () => {
  it('runs helper with removal script', async () => {
    const r = await runner.removeFromContainer({ containerId: 'abc123' });
    expect(r.ok).toBe(true);
    const call = dockerService._mock.mockDocker.createContainer.mock.calls[0][0];
    expect(call.Cmd[2]).toMatch(/nft delete table ip ddout/);
  });

  it('is safe when nothing is applied (helper script uses "|| true")', () => {
    const { _removeScript } = runner._internals;
    expect(_removeScript()).toMatch(/\|\| true/);
  });
});

describe('isApplied', () => {
  it('reports applied when helper output contains APPLIED', async () => {
    const logsStream = { on: jest.fn(function (ev, cb) {
      if (ev === 'data') setImmediate(() => cb(Buffer.concat([Buffer.alloc(8), Buffer.from('table ip ddout\nAPPLIED\n')])));
      else if (ev === 'end') setImmediate(cb);
      return this;
    })};
    dockerService._mock.mockContainer.logs.mockResolvedValueOnce(logsStream);
    const r = await runner.isApplied({ containerId: 'abc123' });
    expect(r.applied).toBe(true);
  });

  it('reports not applied otherwise', async () => {
    const logsStream = { on: jest.fn(function (ev, cb) {
      if (ev === 'data') setImmediate(() => cb(Buffer.concat([Buffer.alloc(8), Buffer.from('NOT_APPLIED\n')])));
      else if (ev === 'end') setImmediate(cb);
      return this;
    })};
    dockerService._mock.mockContainer.logs.mockResolvedValueOnce(logsStream);
    const r = await runner.isApplied({ containerId: 'abc123' });
    expect(r.applied).toBe(false);
  });
});
