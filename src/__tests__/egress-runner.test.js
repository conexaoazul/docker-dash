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

// ─── Stack scope (alpha.4) ─────────────────────────────

describe('applyToStack', () => {
  beforeEach(() => {
    // listContainers mock
    dockerService._mock.mockDocker.listContainers = jest.fn();
    // getContainer().inspect() mock returning bridge-mode, no NET_ADMIN
    const goodInspect = {
      State: { Running: true },
      HostConfig: { NetworkMode: 'bridge', CapAdd: [], Privileged: false },
    };
    dockerService._mock.mockDocker.getContainer = jest.fn().mockImplementation(() => ({
      inspect: jest.fn().mockResolvedValue(goodInspect),
    }));
    // helper container mock (used by applyToContainer/removeFromContainer)
    dockerService._mock.mockDocker.createContainer = jest.fn().mockResolvedValue(dockerService._mock.mockContainer);
  });

  it('requires stackName', async () => {
    await expect(require('../services/egress-runner').applyToStack({})).rejects.toThrow(/stackName/);
  });

  it('throws when stack has no containers', async () => {
    dockerService._mock.mockDocker.listContainers.mockResolvedValueOnce([]);
    await expect(require('../services/egress-runner').applyToStack({ stackName: 'ghost' }))
      .rejects.toThrow(/No containers found/);
  });

  it('applies to every running container + skips non-running', async () => {
    dockerService._mock.mockDocker.listContainers.mockResolvedValueOnce([
      { Id: 'aaa', Names: ['/web'], Labels: { 'com.docker.compose.service': 'web' }, State: 'running' },
      { Id: 'bbb', Names: ['/db'], Labels: { 'com.docker.compose.service': 'db' }, State: 'running' },
      { Id: 'ccc', Names: ['/migrations'], Labels: { 'com.docker.compose.service': 'migrations' }, State: 'exited' },
    ]);
    const result = await require('../services/egress-runner').applyToStack({ stackName: 's1' });
    expect(result.applied).toHaveLength(2);
    expect(result.applied.map(x => x.name)).toEqual(['web', 'db']);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].name).toBe('migrations');
  });

  it('refuses entire stack if any container fails precheck (privileged)', async () => {
    dockerService._mock.mockDocker.listContainers.mockResolvedValueOnce([
      { Id: 'aaa', Names: ['/web'], State: 'running' },
      { Id: 'bbb', Names: ['/db'], State: 'running' },
    ]);
    let call = 0;
    dockerService._mock.mockDocker.getContainer = jest.fn().mockImplementation(() => ({
      inspect: jest.fn().mockResolvedValue(
        ++call === 2
          ? { State: { Running: true }, HostConfig: { NetworkMode: 'bridge', Privileged: true } }
          : { State: { Running: true }, HostConfig: { NetworkMode: 'bridge', CapAdd: [] } }
      ),
    }));
    await expect(require('../services/egress-runner').applyToStack({ stackName: 's1' }))
      .rejects.toThrow(/Stack apply aborted.*db.*privileged/i);

    // Zero helper containers created — we aborted before touching any
    expect(dockerService._mock.mockDocker.createContainer).not.toHaveBeenCalled();
  });

  it('rolls back previously-applied containers on mid-stream failure', async () => {
    dockerService._mock.mockDocker.listContainers.mockResolvedValueOnce([
      { Id: 'aaa', Names: ['/web'], State: 'running' },
      { Id: 'bbb', Names: ['/api'], State: 'running' },
      { Id: 'ccc', Names: ['/db'], State: 'running' },
    ]);
    // Second apply helper fails
    let applyCalls = 0;
    dockerService._mock.mockContainer.wait = jest.fn().mockImplementation(() => {
      applyCalls++;
      if (applyCalls === 2) return Promise.resolve({ StatusCode: 1 });  // second apply fails
      return Promise.resolve({ StatusCode: 0 });
    });

    await expect(require('../services/egress-runner').applyToStack({ stackName: 's1' }))
      .rejects.toThrow(/Stack apply failed at api/);

    // One success + one failure + one rollback = 3 helper spawns
    expect(dockerService._mock.mockDocker.createContainer.mock.calls.length).toBe(3);
  });
});

describe('removeFromStack', () => {
  beforeEach(() => {
    dockerService._mock.mockDocker.listContainers = jest.fn();
    dockerService._mock.mockDocker.createContainer = jest.fn().mockResolvedValue(dockerService._mock.mockContainer);
    dockerService._mock.mockContainer.wait = jest.fn().mockResolvedValue({ StatusCode: 0 });
  });

  it('removes from every running container, skips non-running', async () => {
    dockerService._mock.mockDocker.listContainers.mockResolvedValueOnce([
      { Id: 'aaa', Names: ['/web'], State: 'running' },
      { Id: 'bbb', Names: ['/db'], State: 'exited' },
    ]);
    const r = await require('../services/egress-runner').removeFromStack({ stackName: 's1' });
    expect(r.removed).toHaveLength(1);
    expect(r.removed[0].name).toBe('web');
  });

  it('collects per-container errors, does not abort', async () => {
    dockerService._mock.mockDocker.listContainers.mockResolvedValueOnce([
      { Id: 'aaa', Names: ['/web'], State: 'running' },
      { Id: 'bbb', Names: ['/db'], State: 'running' },
    ]);
    let call = 0;
    dockerService._mock.mockContainer.wait = jest.fn().mockImplementation(() =>
      Promise.resolve({ StatusCode: ++call === 1 ? 1 : 0 })
    );
    const r = await require('../services/egress-runner').removeFromStack({ stackName: 's1' });
    expect(r.removed).toHaveLength(1);
    expect(r.failed).toHaveLength(1);
  });

  it('returns empty for unknown stack', async () => {
    dockerService._mock.mockDocker.listContainers.mockResolvedValueOnce([]);
    const r = await require('../services/egress-runner').removeFromStack({ stackName: 'ghost' });
    expect(r.removed).toEqual([]);
  });
});

describe('statusOfStack', () => {
  beforeEach(() => {
    dockerService._mock.mockDocker.listContainers = jest.fn();
    dockerService._mock.mockDocker.createContainer = jest.fn().mockResolvedValue(dockerService._mock.mockContainer);
    dockerService._mock.mockContainer.wait = jest.fn().mockResolvedValue({ StatusCode: 0 });
  });

  it('reports per-container applied state + summary counts', async () => {
    dockerService._mock.mockDocker.listContainers.mockResolvedValueOnce([
      { Id: 'aaa', Names: ['/web'], State: 'running' },
      { Id: 'bbb', Names: ['/db'], State: 'running' },
      { Id: 'ccc', Names: ['/cron'], State: 'exited' },
    ]);
    // all isApplied calls return APPLIED
    let callNum = 0;
    dockerService._mock.mockContainer.logs = jest.fn().mockImplementation(() => Promise.resolve({
      on: function (ev, cb) {
        if (ev === 'data') setImmediate(() => cb(Buffer.concat([Buffer.alloc(8), Buffer.from(++callNum <= 2 ? 'APPLIED\n' : 'NOT_APPLIED\n')])));
        else if (ev === 'end') setImmediate(cb);
        return this;
      },
    }));
    const r = await require('../services/egress-runner').statusOfStack({ stackName: 's1' });
    expect(r.containers).toHaveLength(3);
    expect(r.appliedCount).toBe(2);
    expect(r.totalCount).toBe(3);
    expect(r.containers.find(c => c.name === 'cron').skipped).toBe(true);  // exited → not checked
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
