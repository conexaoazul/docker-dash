'use strict';

// v8.2.x further-split: extracted from src/routes/misc.js.
// 3 routes for /favorites/* — list, add, remove. Mounted at /favorites.

const { Router } = require('express');
const { favorites } = require('../services/misc');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.get('/', requireAuth, (req, res) => {
  res.json(favorites.list(req.user.id));
});

router.post('/', requireAuth, (req, res) => {
  favorites.add(req.user.id, req.body.containerId);
  res.json({ ok: true });
});

router.delete('/:containerId', requireAuth, (req, res) => {
  favorites.remove(req.user.id, req.params.containerId);
  res.json({ ok: true });
});

module.exports = router;
