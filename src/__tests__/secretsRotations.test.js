'use strict';

// Tests for /api/secrets-rotations endpoints (FIX #19 new tests)

process.env.APP_SECRET = 'test-secret-secrets-rotations';
process.env.APP_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.ADMIN_PASSWORD = 'RotationsTest123!';

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
app.use('/api/secrets-rotations', require('../routes/secretsRotations'));

let adminToken = null;

beforeAll(async () => {
  require('./helpers/seedTestAdmin').clearMustChange('admin');
  const res = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin', password: 'RotationsTest123!' });
  adminToken = res.body.token;
});

describe('GET /api/secrets-rotations — list', () => {
  it('should return empty array initially', async () => {
    const res = await request(app)
      .get('/api/secrets-rotations')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
  });

  it('should return 401 without auth', async () => {
    await request(app).get('/api/secrets-rotations').expect(401);
  });
});

describe('GET /api/secrets-rotations/summary — summary', () => {
  it('should return summary with zero counts initially', async () => {
    const res = await request(app)
      .get('/api/secrets-rotations/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('ok');
    expect(res.body).toHaveProperty('due_soon');
    expect(res.body).toHaveProperty('overdue');
    expect(res.body.total).toBe(0);
  });

  it('should return 401 without auth', async () => {
    await request(app).get('/api/secrets-rotations/summary').expect(401);
  });
});

describe('POST /api/secrets-rotations/bulk — bulk register', () => {
  it('should return 400 when secrets array is missing', async () => {
    const res = await request(app)
      .post('/api/secrets-rotations/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ appName: 'myapp' })
      .expect(400);

    expect(res.body.error).toMatch(/secrets/i);
  });

  it('should return 400 when secrets array is empty', async () => {
    const res = await request(app)
      .post('/api/secrets-rotations/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ appName: 'myapp', secrets: [] })
      .expect(400);

    expect(res.body.error).toMatch(/secrets/i);
  });

  it('should register a bulk list of secrets', async () => {
    const res = await request(app)
      .post('/api/secrets-rotations/bulk')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        appName: 'test-app',
        hostId: 0,
        secrets: [
          { envKey: 'DB_PASSWORD', secretName: 'Database password', secretType: 'password' },
          { envKey: 'API_KEY', secretName: 'API key', secretType: 'api_key' },
        ],
      })
      .expect(200);

    // Route returns { ok, inserted, updated, preserved }
    expect(res.body.ok).toBe(true);
    expect(res.body.inserted).toBe(2);
  });

  it('should list registered secrets after bulk insert', async () => {
    const res = await request(app)
      .get('/api/secrets-rotations')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const item = res.body[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('app_name');
    expect(item).toHaveProperty('env_key');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('daysUntilDue');
  });

  it('should update summary counts after bulk insert', async () => {
    const res = await request(app)
      .get('/api/secrets-rotations/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.total).toBeGreaterThanOrEqual(2);
  });
});

describe('POST /api/secrets-rotations/:id/mark-rotated', () => {
  let rotationId = null;

  beforeAll(async () => {
    // Get the first registered rotation
    const list = await request(app)
      .get('/api/secrets-rotations')
      .set('Authorization', `Bearer ${adminToken}`);
    rotationId = list.body[0]?.id;
  });

  it('should return 404 for nonexistent rotation', async () => {
    await request(app)
      .post('/api/secrets-rotations/99999/mark-rotated')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
  });

  it('should mark a rotation as rotated', async () => {
    if (!rotationId) return; // skip if no rotation was created

    const res = await request(app)
      .post(`/api/secrets-rotations/${rotationId}/mark-rotated`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Rotated in test' })
      .expect(200);

    expect(res.body.ok).toBe(true);
    expect(res.body.nextDueAt).toBeDefined();
  });
});
