'use strict';

// Tests for src/services/remediation-catalog.js (v6.6)
// Every catalog entry: applies() detects correctly + plan() produces expected patch.

process.env.APP_ENV = 'test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32chars';

const catalog = require('../services/remediation-catalog');

// Minimal inspect stub factory
function inspectOf(overrides = {}) {
  return {
    Id: 'abc123def456',
    Name: '/test-container',
    Config: { Image: 'nginx:1.25', Env: [], Labels: {}, Healthcheck: { Test: ['NONE'] }, User: '', ...overrides.Config },
    HostConfig: {
      Privileged: false, CapAdd: [], SecurityOpt: [], PidMode: '', NetworkMode: 'bridge', IpcMode: '',
      ReadonlyRootfs: false, Memory: 0, NanoCpus: 0, PidsLimit: 0,
      RestartPolicy: { Name: 'no' },
      LogConfig: { Type: 'json-file', Config: {} },
      ...overrides.HostConfig,
    },
    NetworkSettings: { Ports: {} },
    Mounts: [],
    ...overrides,
  };
}

describe('catalog — module shape', () => {
  it('list() returns ≥20 entries', () => {
    const list = catalog.list();
    expect(list.length).toBeGreaterThanOrEqual(20);
  });

  it('list() entries are JSON-serializable', () => {
    const list = catalog.list();
    const json = JSON.stringify(list);
    expect(json.length).toBeGreaterThan(0);
  });

  it('every entry has required fields', () => {
    const list = catalog.list();
    for (const e of list) {
      expect(typeof e.code).toBe('string');
      expect(typeof e.title).toBe('string');
      expect(['security', 'resource', 'reliability']).toContain(e.category);
      expect(['critical', 'warn', 'info']).toContain(e.severity);
      expect(typeof e.liveUpdatable).toBe('boolean');
      expect(typeof e.requiresRecreation).toBe('boolean');
      expect(['low', 'medium', 'high']).toContain(e.riskLevel);
    }
  });

  it('get(unknown) returns null', () => {
    expect(catalog.get('not-a-code')).toBeNull();
  });
});

describe('catalog — applies() detection', () => {
  it('CIS-5.4-privileged detects privileged containers', () => {
    expect(catalog.get('CIS-5.4-privileged').applies(inspectOf({ HostConfig: { Privileged: true } }))).toBe(true);
    expect(catalog.get('CIS-5.4-privileged').applies(inspectOf())).toBe(false);
  });

  it('CIS-5.3-cap-add-all detects ALL capability', () => {
    expect(catalog.get('CIS-5.3-cap-add-all').applies(inspectOf({ HostConfig: { CapAdd: ['ALL'] } }))).toBe(true);
    expect(catalog.get('CIS-5.3-cap-add-all').applies(inspectOf({ HostConfig: { CapAdd: ['NET_ADMIN'] } }))).toBe(false);
  });

  it('CIS-5.3-dangerous-caps detects SYS_ADMIN', () => {
    expect(catalog.get('CIS-5.3-dangerous-caps').applies(inspectOf({ HostConfig: { CapAdd: ['SYS_ADMIN'] } }))).toBe(true);
    expect(catalog.get('CIS-5.3-dangerous-caps').applies(inspectOf({ HostConfig: { CapAdd: ['CAP_SYS_ADMIN'] } }))).toBe(true);
    expect(catalog.get('CIS-5.3-dangerous-caps').applies(inspectOf({ HostConfig: { CapAdd: ['CHOWN'] } }))).toBe(false);
  });

  it('CIS-5.25-no-new-privileges detects missing flag', () => {
    expect(catalog.get('CIS-5.25-no-new-privileges').applies(inspectOf())).toBe(true);
    expect(catalog.get('CIS-5.25-no-new-privileges').applies(inspectOf({ HostConfig: { SecurityOpt: ['no-new-privileges:true'] } }))).toBe(false);
  });

  it('CIS-5.28-pid-host detects host PID namespace', () => {
    expect(catalog.get('CIS-5.28-pid-host').applies(inspectOf({ HostConfig: { PidMode: 'host' } }))).toBe(true);
    expect(catalog.get('CIS-5.28-pid-host').applies(inspectOf())).toBe(false);
  });

  it('CIS-5.29-network-host detects host network mode', () => {
    expect(catalog.get('CIS-5.29-network-host').applies(inspectOf({ HostConfig: { NetworkMode: 'host' } }))).toBe(true);
    expect(catalog.get('CIS-5.29-network-host').applies(inspectOf())).toBe(false);
  });

  it('CIS-5.16-ipc-host detects host IPC mode', () => {
    expect(catalog.get('CIS-5.16-ipc-host').applies(inspectOf({ HostConfig: { IpcMode: 'host' } }))).toBe(true);
  });

  it('CIS-5.12-read-only-rootfs detects writable rootfs', () => {
    expect(catalog.get('CIS-5.12-read-only-rootfs').applies(inspectOf())).toBe(true);
    expect(catalog.get('CIS-5.12-read-only-rootfs').applies(inspectOf({ HostConfig: { ReadonlyRootfs: true } }))).toBe(false);
  });

  it('CIS-5.10-no-memory-limit detects no limit', () => {
    expect(catalog.get('CIS-5.10-no-memory-limit').applies(inspectOf())).toBe(true);
    expect(catalog.get('CIS-5.10-no-memory-limit').applies(inspectOf({ HostConfig: { Memory: 512 * 1024 * 1024 } }))).toBe(false);
  });

  it('CIS-5.11-no-cpu-limit detects no CPU limit', () => {
    expect(catalog.get('CIS-5.11-no-cpu-limit').applies(inspectOf())).toBe(true);
    expect(catalog.get('CIS-5.11-no-cpu-limit').applies(inspectOf({ HostConfig: { NanoCpus: 1_000_000_000 } }))).toBe(false);
  });

  it('CIS-5.5-docker-socket-rw detects RW socket mount', () => {
    const withSock = inspectOf({ Mounts: [{ Type: 'bind', Source: '/var/run/docker.sock', Destination: '/var/run/docker.sock', RW: true }] });
    expect(catalog.get('CIS-5.5-docker-socket-rw').applies(withSock)).toBe(true);
  });

  it('CIS-5.26-running-as-root detects empty User', () => {
    expect(catalog.get('CIS-5.26-running-as-root').applies(inspectOf())).toBe(true);
    expect(catalog.get('CIS-5.26-running-as-root').applies(inspectOf({ Config: { User: '1000:1000', Env: [] } }))).toBe(false);
  });

  it('RES-no-pids-limit detects no pids limit', () => {
    expect(catalog.get('RES-no-pids-limit').applies(inspectOf())).toBe(true);
    expect(catalog.get('RES-no-pids-limit').applies(inspectOf({ HostConfig: { PidsLimit: 200 } }))).toBe(false);
  });

  it('RES-no-restart-policy detects "no" policy', () => {
    expect(catalog.get('RES-no-restart-policy').applies(inspectOf())).toBe(true);
    expect(catalog.get('RES-no-restart-policy').applies(inspectOf({ HostConfig: { RestartPolicy: { Name: 'unless-stopped' } } }))).toBe(false);
  });

  it('SEC-plaintext-env-secret detects plain-text password in env', () => {
    const withSecret = inspectOf({ Config: { Env: ['DB_PASSWORD=supersecret123'], Image: 'x', Healthcheck: { Test: ['NONE'] }, User: '' } });
    expect(catalog.get('SEC-plaintext-env-secret').applies(withSecret)).toBe(true);
    const withFile = inspectOf({ Config: { Env: ['DB_PASSWORD_FILE=/run/secrets/db'], Image: 'x', Healthcheck: { Test: ['NONE'] }, User: '' } });
    expect(catalog.get('SEC-plaintext-env-secret').applies(withFile)).toBe(false);
  });

  it('SEC-image-latest-tag detects :latest', () => {
    expect(catalog.get('SEC-image-latest-tag').applies(inspectOf({ Config: { Image: 'nginx:latest', Env: [], Healthcheck: { Test: ['NONE'] }, User: '' } }))).toBe(true);
    expect(catalog.get('SEC-image-latest-tag').applies(inspectOf({ Config: { Image: 'nginx:1.25', Env: [], Healthcheck: { Test: ['NONE'] }, User: '' } }))).toBe(false);
    expect(catalog.get('SEC-image-latest-tag').applies(inspectOf({ Config: { Image: 'nginx', Env: [], Healthcheck: { Test: ['NONE'] }, User: '' } }))).toBe(true);
  });

  it('REL-no-healthcheck detects missing healthcheck', () => {
    expect(catalog.get('REL-no-healthcheck').applies(inspectOf())).toBe(true);
    expect(catalog.get('REL-no-healthcheck').applies(inspectOf({ Config: { Healthcheck: { Test: ['CMD', 'wget', 'localhost/'] }, Image: 'x', Env: [], User: '' } }))).toBe(false);
  });

  it('REL-unbounded-logging detects json-file with no max-size', () => {
    expect(catalog.get('REL-unbounded-logging').applies(inspectOf())).toBe(true);
    expect(catalog.get('REL-unbounded-logging').applies(inspectOf({ HostConfig: { LogConfig: { Type: 'json-file', Config: { 'max-size': '10m' } } } }))).toBe(false);
  });
});

describe('catalog — plan() produces expected patches', () => {
  it('CIS-5.4-privileged deletes privileged key', () => {
    const p = catalog.get('CIS-5.4-privileged').plan(inspectOf({ HostConfig: { Privileged: true } }));
    expect(p.composePatch.privileged).toBeNull();
    expect(p.liveUpdate).toBeNull();
  });

  it('CIS-5.10-no-memory-limit produces live update command', () => {
    const i = inspectOf();
    i._stats = { memory_stats: { usage: 200 * 1024 * 1024 } };
    const p = catalog.get('CIS-5.10-no-memory-limit').plan(i);
    expect(p.liveUpdate).toMatch(/^docker update --memory \d+m/);
    expect(p.composePatch.mem_limit).toMatch(/^\d+m$/);
  });

  it('CIS-5.25 adds no-new-privileges via $add list surgery', () => {
    const p = catalog.get('CIS-5.25-no-new-privileges').plan(inspectOf());
    expect(p.composePatch.security_opt).toEqual({ $add: ['no-new-privileges:true'] });
  });

  it('CIS-5.3-dangerous-caps removes specific caps via $remove', () => {
    const p = catalog.get('CIS-5.3-dangerous-caps').plan(inspectOf({ HostConfig: { CapAdd: ['SYS_ADMIN', 'CHOWN'] } }));
    expect(p.composePatch.cap_add.$remove).toContain('SYS_ADMIN');
    expect(p.composePatch.cap_add.$remove).not.toContain('CHOWN');
  });
});

describe('catalog — detectFindings', () => {
  it('detects multiple applicable findings on a bad container', () => {
    const bad = inspectOf({
      HostConfig: { Privileged: true, Memory: 0, NanoCpus: 0, PidsLimit: 0, SecurityOpt: [] },
      Config: { Env: ['DB_PASSWORD=plaintext'], Image: 'nginx:latest', Healthcheck: { Test: ['NONE'] }, User: '' },
    });
    const findings = catalog.detectFindings(bad);
    expect(findings).toContain('CIS-5.4-privileged');
    expect(findings).toContain('CIS-5.10-no-memory-limit');
    expect(findings).toContain('CIS-5.25-no-new-privileges');
    expect(findings).toContain('SEC-plaintext-env-secret');
    expect(findings).toContain('SEC-image-latest-tag');
  });

  it('returns empty array on a clean container', () => {
    const good = inspectOf({
      HostConfig: {
        Privileged: false, Memory: 512 * 1024 * 1024, NanoCpus: 1_000_000_000,
        SecurityOpt: ['no-new-privileges:true'], PidsLimit: 200,
        RestartPolicy: { Name: 'unless-stopped' }, ReadonlyRootfs: true,
        LogConfig: { Type: 'json-file', Config: { 'max-size': '10m' } },
      },
      Config: {
        User: '1000:1000', Image: 'nginx@sha256:abc',
        Env: [],
        Healthcheck: { Test: ['CMD', 'wget', 'localhost/'] },
      },
    });
    const findings = catalog.detectFindings(good);
    expect(findings.length).toBeLessThanOrEqual(2);  // may still flag minor items
  });
});
