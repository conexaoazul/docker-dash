'use strict';

// Tests for src/services/observability-import.js (v7.2.0)

const importer = require('../services/observability-import');

describe('scrapeConfigSnippet', () => {
  it('returns valid YAML with default target + port', () => {
    const out = importer.scrapeConfigSnippet();
    expect(out).toContain('job_name: docker-dash');
    expect(out).toContain('metrics_path: /api/metrics');
    expect(out).toContain("targets: ['docker-dash:8101']");
    expect(out).toContain("service: docker-dash");
  });

  it('respects custom target name', () => {
    const out = importer.scrapeConfigSnippet('my-app');
    expect(out).toContain("targets: ['my-app:8101']");
  });

  it('respects custom port', () => {
    const out = importer.scrapeConfigSnippet('docker-dash', 9000);
    expect(out).toContain("targets: ['docker-dash:9000']");
  });

  it('includes 15s scrape interval', () => {
    expect(importer.scrapeConfigSnippet()).toContain('scrape_interval: 15s');
  });
});

describe('importDashboard — argument validation', () => {
  it('throws when grafanaUrl missing', async () => {
    await expect(importer.importDashboard('', 'token')).rejects.toThrow(/grafanaUrl and token are required/);
  });

  it('throws when token missing', async () => {
    await expect(importer.importDashboard('http://grafana', '')).rejects.toThrow(/grafanaUrl and token are required/);
  });

  it('throws on malformed URL', async () => {
    await expect(importer.importDashboard('not a url', 'token')).rejects.toThrow(/Invalid grafanaUrl/);
  });
});

describe('importDashboard — HTTP behavior', () => {
  let httpModule;
  let requestSpy;

  beforeEach(() => {
    jest.resetModules();
    httpModule = require('http');
  });

  afterEach(() => {
    if (requestSpy) requestSpy.mockRestore();
  });

  function _mockHttpResponse(statusCode, body) {
    const { EventEmitter } = require('events');
    const fakeReq = new EventEmitter();
    fakeReq.write = jest.fn();
    fakeReq.end = jest.fn(() => {
      // Simulate the response asynchronously
      setImmediate(() => {
        const fakeRes = new EventEmitter();
        fakeRes.statusCode = statusCode;
        if (fakeReq._callback) fakeReq._callback(fakeRes);
        setImmediate(() => {
          fakeRes.emit('data', Buffer.from(body));
          fakeRes.emit('end');
        });
      });
    });
    fakeReq.destroy = jest.fn();
    return fakeReq;
  }

  it('POSTs to /api/dashboards/db with Bearer auth and returns parsed UID', async () => {
    const captured = {};
    requestSpy = jest.spyOn(httpModule, 'request').mockImplementation((opts, cb) => {
      captured.opts = opts;
      const req = _mockHttpResponse(200, JSON.stringify({
        uid: 'docker-dash-overview', url: '/d/docker-dash-overview/docker-dash-overview',
      }));
      req._callback = cb;
      return req;
    });

    const result = await importer.importDashboard('http://grafana:3000', 'glsa_abc123');

    expect(captured.opts.method).toBe('POST');
    expect(captured.opts.path).toBe('/api/dashboards/db');
    expect(captured.opts.headers['Authorization']).toBe('Bearer glsa_abc123');
    expect(captured.opts.headers['Content-Type']).toBe('application/json');
    expect(result.success).toBe(true);
    expect(result.dashboardUid).toBe('docker-dash-overview');
    expect(result.dashboardUrl).toMatch(/d\/docker-dash-overview/);
  });

  it('throws on non-200 Grafana response with snippet of body', async () => {
    requestSpy = jest.spyOn(httpModule, 'request').mockImplementation((opts, cb) => {
      const req = _mockHttpResponse(401, '{"message":"Unauthorized"}');
      req._callback = cb;
      return req;
    });

    await expect(importer.importDashboard('http://grafana:3000', 'bad')).rejects.toThrow(/HTTP 401/);
  });

  it('throws on network error', async () => {
    requestSpy = jest.spyOn(httpModule, 'request').mockImplementation(() => {
      const { EventEmitter } = require('events');
      const req = new EventEmitter();
      req.write = jest.fn();
      req.end = jest.fn(() => setImmediate(() => req.emit('error', new Error('ECONNREFUSED'))));
      req.destroy = jest.fn();
      return req;
    });

    await expect(importer.importDashboard('http://grafana:3000', 'token')).rejects.toThrow(/Network error/);
  });

  it('falls back gracefully when Grafana returns 200 + non-JSON body', async () => {
    requestSpy = jest.spyOn(httpModule, 'request').mockImplementation((opts, cb) => {
      const req = _mockHttpResponse(200, 'OK');  // not JSON, unusual but tolerated
      req._callback = cb;
      return req;
    });

    const result = await importer.importDashboard('http://grafana:3000', 'token');
    expect(result.success).toBe(true);
    expect(result.dashboardUid).toBe('docker-dash-overview');  // fallback default
  });

  it('strips id + version from dashboard before POST (prevents 412 on re-import)', async () => {
    const capturedBody = {};
    requestSpy = jest.spyOn(httpModule, 'request').mockImplementation((opts, cb) => {
      const req = _mockHttpResponse(200, '{"uid":"x"}');
      req._callback = cb;
      req.write = jest.fn((body) => { capturedBody.raw = body.toString(); });
      return req;
    });

    await importer.importDashboard('http://grafana:3000', 'token');
    const payload = JSON.parse(capturedBody.raw);
    expect(payload.dashboard.id).toBeUndefined();
    expect(payload.dashboard.version).toBeUndefined();
    expect(payload.overwrite).toBe(true);
  });
});

describe('_loadDashboard internal helper', () => {
  it('loads and parses the bundled dashboard JSON successfully', () => {
    const d = importer._internals._loadDashboard();
    expect(d).toBeDefined();
    expect(d.title).toBe('Docker Dash — Overview');
    expect(Array.isArray(d.panels)).toBe(true);
    expect(d.panels.length).toBe(8);
  });
});
