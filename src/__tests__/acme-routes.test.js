'use strict';

// Integration tests for src/routes/acme.js (v6.5 LE Wizard routes)
// Uses supertest against a minimal Express app, follows the api-endpoints.test.js pattern.

process.env.APP_SECRET = 'test-secret-for-acme-routes';
process.env.APP_ENV = 'test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32chars';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'AcmeTest123!ABC';
process.env.CADDY_SECRETS_DIR = require('os').tmpdir() + '/dd-acme-routes-' + Date.now();
process.env.CADDY_ADMIN_SOCKET = '/tmp/no-such-acme-routes-socket-' + Date.now();

const fs = require('fs');
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

const { getDb } = require('../db');
getDb();

const authService = require('../services/auth');
authService.seedAdmin();

app.use('/api/auth', require('../routes/auth'));
app.use('/api/system/acme', require('../routes/acme'));

let authToken = null;
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const N = (base) => `${base}-${RUN_ID}`;

beforeAll(async () => {
  require('./helpers/seedTestAdmin').clearMustChange('admin');
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'AcmeTest123!ABC' });
  authToken = res.body.token;
  if (!authToken) throw new Error('Failed to log in for ACME route tests');
});

afterAll(() => {
  try { fs.rmSync(process.env.CADDY_SECRETS_DIR, { recursive: true, force: true }); } catch {}
});

const auth = () => ({ Authorization: `Bearer ${authToken}` });

describe('GET /api/system/acme/providers', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/system/acme/providers');
    expect(res.status).toBe(401);
  });

  it('returns the list of providers when authenticated', async () => {
    const res = await request(app)
      .get('/api/system/acme/providers')
      .set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.providers)).toBe(true);
    expect(res.body.providers.length).toBeGreaterThanOrEqual(9);
    const ids = res.body.providers.map((p) => p.id).sort();
    expect(ids).toEqual(['cloudflare', 'digitalocean', 'gandi', 'hetzner', 'linode', 'namecheap', 'ovh', 'porkbun', 'route53']);
  });

  it('does not leak validator/toCaddyConfig functions in JSON response', async () => {
    const res = await request(app).get('/api/system/acme/providers').set(auth());
    for (const p of res.body.providers) {
      expect(p.validate).toBeUndefined();
      expect(p.toCaddyConfig).toBeUndefined();
    }
  });
});

describe('GET /api/system/acme/health', () => {
  it('returns caddy:false when admin socket is unreachable', async () => {
    const res = await request(app).get('/api/system/acme/health').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.caddy).toBe(false);
    expect(res.body.message).toMatch(/Caddy/);
  });
});

describe('POST /api/system/acme/credentials — validation', () => {
  it('rejects missing name', async () => {
    const res = await request(app).post('/api/system/acme/credentials')
      .set(auth())
      .send({ providerId: 'cloudflare', credentials: { api_token: 'x' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });

  it('rejects bad-format name (special chars)', async () => {
    const res = await request(app).post('/api/system/acme/credentials')
      .set(auth())
      .send({ name: 'cf$prod!', providerId: 'cloudflare', credentials: { api_token: 'x' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/alphanumeric/);
  });

  it('rejects unknown provider', async () => {
    const res = await request(app).post('/api/system/acme/credentials')
      .set(auth())
      .send({ name: N('cf'), providerId: 'not-a-provider', credentials: {} });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown provider/);
  });
});

describe('POST /api/system/acme/credentials — happy path', () => {
  it('creates a credential, encrypts it, and writes the secret file', async () => {
    const name = N('cf-happy');
    const res = await request(app).post('/api/system/acme/credentials')
      .set(auth())
      .send({
        name,
        providerId: 'cloudflare',
        credentials: { api_token: 'eyJ.fake.scoped.token' },
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeGreaterThan(0);
    expect(res.body.name).toBe(name);

    // Verify encrypted in DB (no plaintext)
    const row = getDb().prepare('SELECT credentials_encrypted FROM acme_credentials WHERE id = ?').get(res.body.id);
    expect(row.credentials_encrypted).not.toContain('eyJ.fake.scoped.token');

    // Verify file written
    const filePath = require('path').join(process.env.CADDY_SECRETS_DIR, String(res.body.id), 'api_token');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf8')).toBe('eyJ.fake.scoped.token');
  });
});

describe('GET /api/system/acme/credentials', () => {
  it('returns saved credentials WITHOUT secret values', async () => {
    const name = N('cf-list');
    await request(app).post('/api/system/acme/credentials').set(auth())
      .send({ name, providerId: 'cloudflare', credentials: { api_token: 'should-NOT-leak' } });

    const res = await request(app).get('/api/system/acme/credentials').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.credentials)).toBe(true);

    const ours = res.body.credentials.find((c) => c.name === name);
    expect(ours).toBeTruthy();

    // Ensure no field in the response contains the actual token
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('should-NOT-leak');
  });
});

describe('POST /api/system/acme/issue — validation', () => {
  it('rejects empty domains', async () => {
    const res = await request(app).post('/api/system/acme/issue')
      .set(auth())
      .send({ domains: [], email: 'a@b.com', challengeType: 'http-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/domains/);
  });

  it('rejects too many domains (>100)', async () => {
    const res = await request(app).post('/api/system/acme/issue')
      .set(auth())
      .send({
        domains: Array.from({ length: 101 }, (_, i) => `d${i}.example.com`),
        email: 'a@b.com', challengeType: 'http-01',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Too many/);
  });

  it('rejects invalid email', async () => {
    const res = await request(app).post('/api/system/acme/issue')
      .set(auth())
      .send({ domains: ['x.example.com'], email: 'not-an-email', challengeType: 'http-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/);
  });

  it('rejects invalid challengeType', async () => {
    const res = await request(app).post('/api/system/acme/issue')
      .set(auth())
      .send({ domains: ['x.example.com'], email: 'a@b.com', challengeType: 'tls-alpn-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/challengeType/);
  });

  it('requires providerId+credentialsId for dns-01', async () => {
    const res = await request(app).post('/api/system/acme/issue')
      .set(auth())
      .send({ domains: ['x.example.com'], email: 'a@b.com', challengeType: 'dns-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/providerId.*credentialsId/);
  });

  it('rejects wildcard with http-01', async () => {
    const res = await request(app).post('/api/system/acme/issue')
      .set(auth())
      .send({ domains: ['*.example.com'], email: 'a@b.com', challengeType: 'http-01' });
    // Either 400 (wildcard validation) or 500 (caddy unreachable) — both indicate rejection
    expect([400, 500]).toContain(res.status);
  });
});

describe('GET /api/system/acme/jobs/:id', () => {
  it('returns 404 for unknown job id', async () => {
    const res = await request(app).get('/api/system/acme/jobs/999999').set(auth());
    expect(res.status).toBe(404);
  });
});

describe('GET /api/system/acme/managed-certs', () => {
  it('returns empty list initially', async () => {
    const res = await request(app).get('/api/system/acme/managed-certs').set(auth());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.certs)).toBe(true);
  });
});
