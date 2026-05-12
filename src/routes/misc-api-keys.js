'use strict';

// v8.2.x further-split: extracted from src/routes/misc.js.
// 3 routes for /api-keys/* — list, create, revoke. Mounted at /api-keys.

const { Router } = require('express');
const { apiKeys } = require('../services/misc');
const auditService = require('../services/audit');
const { requireAuth } = require('../middleware/auth');
const { getClientIp } = require('../utils/helpers');
const log = require('../utils/logger')('misc');

const router = Router();

router.get('/', requireAuth, (req, res) => {
  res.json(apiKeys.list(req.user.id));
});

router.post('/', requireAuth, (req, res) => {
  try {
    const result = apiKeys.create(req.user.id, req.body);
    auditService.log({ userId: req.user.id, username: req.user.username,
      action: 'apikey_create', details: { name: req.body.name }, ip: getClientIp(req) });
    res.status(201).json(result);
  } catch (err) { log.error('api-keys create', err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/:id', requireAuth, (req, res) => {
  try { apiKeys.revoke(parseInt(req.params.id), req.user.id); res.json({ ok: true }); }
  catch (err) { log.error('api-keys revoke', err); res.status(500).json({ error: 'Internal server error' }); }
});

module.exports = router;
