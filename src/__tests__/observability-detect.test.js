'use strict';

// Tests for src/services/observability-detect.js (v7.2.0)

const detect = require('../services/observability-detect');

function _mockDockerService(containers) {
  return {
    getDocker() {
      return {
        listContainers: jest.fn().mockResolvedValue(containers),
      };
    },
  };
}

describe('observability-detect', () => {
  it('returns both slots null when no containers are running', async () => {
    const ds = _mockDockerService([]);
    const r = await detect.detect(ds);
    expect(r.prometheus).toBeNull();
    expect(r.grafana).toBeNull();
    expect(r.dockerDashContainerId).toBeNull();
  });

  it('detects Prometheus by prom/prometheus image prefix', async () => {
    const ds = _mockDockerService([
      { Id: 'abc1234567890xyz', Names: ['/docker-dash-prometheus'], Image: 'prom/prometheus:v3.0.1', Ports: [{ PrivatePort: 9090, PublicPort: null }] },
    ]);
    const r = await detect.detect(ds);
    expect(r.prometheus).not.toBeNull();
    expect(r.prometheus.name).toBe('docker-dash-prometheus');
    expect(r.prometheus.image).toBe('prom/prometheus:v3.0.1');
    expect(r.prometheus.containerId).toBe('abc123456789');
    expect(r.prometheus.internalUrl).toBe('http://docker-dash-prometheus:9090');
  });

  it('detects Grafana by grafana/grafana image prefix', async () => {
    const ds = _mockDockerService([
      { Id: 'xyz9876543210abc', Names: ['/docker-dash-grafana'], Image: 'grafana/grafana:11.3.0', Ports: [{ PrivatePort: 3000, PublicPort: 3001 }] },
    ]);
    const r = await detect.detect(ds);
    expect(r.grafana).not.toBeNull();
    expect(r.grafana.name).toBe('docker-dash-grafana');
    expect(r.grafana.internalUrl).toBe('http://docker-dash-grafana:3000');
    expect(r.grafana.externalPort).toBe(3001);
  });

  it('detects Grafana Enterprise (alternate image prefix)', async () => {
    const ds = _mockDockerService([
      { Id: '1234567890abcdef', Names: ['/graf-ent'], Image: 'grafana/grafana-enterprise:11.3.0', Ports: [] },
    ]);
    const r = await detect.detect(ds);
    expect(r.grafana).not.toBeNull();
    expect(r.grafana.image).toMatch(/grafana-enterprise/);
  });

  it('detects Bitnami Prometheus + Grafana (alternate image prefixes)', async () => {
    const ds = _mockDockerService([
      { Id: 'aaaaaaaaaaaaaaaa', Names: ['/bn-prom'], Image: 'bitnami/prometheus:latest', Ports: [] },
      { Id: 'bbbbbbbbbbbbbbbb', Names: ['/bn-graf'], Image: 'bitnami/grafana:latest', Ports: [] },
    ]);
    const r = await detect.detect(ds);
    expect(r.prometheus.name).toBe('bn-prom');
    expect(r.grafana.name).toBe('bn-graf');
  });

  it('strips leading slash from container name', async () => {
    const ds = _mockDockerService([
      { Id: '1111111111111111', Names: ['/my-prom'], Image: 'prom/prometheus:latest', Ports: [] },
    ]);
    const r = await detect.detect(ds);
    expect(r.prometheus.name).toBe('my-prom');
  });

  it('handles empty Names array without throwing', async () => {
    const ds = _mockDockerService([
      { Id: 'xxxxxxxxxxxxxxxx', Names: [], Image: 'prom/prometheus:latest', Ports: [] },
    ]);
    const r = await detect.detect(ds);
    expect(r.prometheus).not.toBeNull();
    expect(r.prometheus.name).toBe('');
    expect(r.prometheus.internalUrl).toBeNull();  // can't construct URL without a name
  });

  it('returns externalPort when Ports publishes 9090 / 3000', async () => {
    const ds = _mockDockerService([
      { Id: '1111111111111111', Names: ['/p'], Image: 'prom/prometheus:latest', Ports: [{ PrivatePort: 9090, PublicPort: 19090 }] },
      { Id: '2222222222222222', Names: ['/g'], Image: 'grafana/grafana:latest', Ports: [{ PrivatePort: 3000, PublicPort: 3005 }] },
    ]);
    const r = await detect.detect(ds);
    expect(r.prometheus.externalPort).toBe(19090);
    expect(r.grafana.externalPort).toBe(3005);
  });

  it('returns externalPort null when port is not published externally', async () => {
    const ds = _mockDockerService([
      { Id: '1111111111111111', Names: ['/p'], Image: 'prom/prometheus:latest', Ports: [{ PrivatePort: 9090, PublicPort: null }] },
    ]);
    const r = await detect.detect(ds);
    expect(r.prometheus.externalPort).toBeNull();
  });

  it('identifies our own container via name regex', async () => {
    const ds = _mockDockerService([
      { Id: 'dddddddddddddddd', Names: ['/docker-dash'], Image: 'docker-dash:7.2.0', Ports: [] },
    ]);
    const r = await detect.detect(ds);
    expect(r.dockerDashContainerId).toBe('dddddddddddd');
  });

  it('does NOT match docker-dash-redis / -prometheus / -grafana / -caddy as self', async () => {
    const ds = _mockDockerService([
      { Id: '1111111111111111', Names: ['/docker-dash-redis'], Image: 'redis:7-alpine', Ports: [] },
      { Id: '2222222222222222', Names: ['/docker-dash-prometheus'], Image: 'prom/prometheus:v3.0.1', Ports: [] },
      { Id: '3333333333333333', Names: ['/docker-dash-grafana'], Image: 'grafana/grafana:11.3.0', Ports: [] },
      { Id: '4444444444444444', Names: ['/docker-dash-caddy'], Image: 'caddy:2-alpine', Ports: [] },
    ]);
    const r = await detect.detect(ds);
    expect(r.dockerDashContainerId).toBeNull();
    // But Prometheus + Grafana are still detected normally
    expect(r.prometheus).not.toBeNull();
    expect(r.grafana).not.toBeNull();
  });

  it('never throws on dockerService failure — returns empty result + warn', async () => {
    const ds = {
      getDocker() { return { listContainers: jest.fn().mockRejectedValue(new Error('boom')) }; },
    };
    const r = await detect.detect(ds);
    expect(r.prometheus).toBeNull();
    expect(r.grafana).toBeNull();
    expect(r.dockerDashContainerId).toBeNull();
  });

  it('keeps FIRST match for Prometheus if multiple containers match', async () => {
    const ds = _mockDockerService([
      { Id: '1111111111111111', Names: ['/prom-a'], Image: 'prom/prometheus:latest', Ports: [] },
      { Id: '2222222222222222', Names: ['/prom-b'], Image: 'prom/prometheus:v2.54.0', Ports: [] },
    ]);
    const r = await detect.detect(ds);
    expect(r.prometheus.name).toBe('prom-a');  // first wins
  });

  it('image prefix match is case-insensitive', async () => {
    const ds = _mockDockerService([
      { Id: '1111111111111111', Names: ['/mixed'], Image: 'PROM/PROMETHEUS:latest', Ports: [] },
    ]);
    const r = await detect.detect(ds);
    expect(r.prometheus).not.toBeNull();
  });

  it('ignores unrelated images', async () => {
    const ds = _mockDockerService([
      { Id: '1111111111111111', Names: ['/nginx'], Image: 'nginx:latest', Ports: [] },
      { Id: '2222222222222222', Names: ['/pg'], Image: 'postgres:16', Ports: [] },
    ]);
    const r = await detect.detect(ds);
    expect(r.prometheus).toBeNull();
    expect(r.grafana).toBeNull();
  });
});
