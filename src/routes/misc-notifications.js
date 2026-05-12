'use strict';

// v8.2.x further-split: extracted from src/routes/misc.js.
// 6 routes for /notifications/* — list, count, mark-read, read-all, delete, bulk.
// Mounted at /notifications.

const { Router } = require('express');
const { notifications } = require('../services/misc');
const { requireAuth } = require('../middleware/auth');
const log = require('../utils/logger')('misc');

const router = Router();

router.get('/', requireAuth, (req, res) => {
  const { unreadOnly, page, limit, type } = req.query;
  res.json(notifications.list(req.user.id, {
    unreadOnly: unreadOnly === 'true',
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 50,
    type: type || undefined,
  }));
});

router.get('/count', requireAuth, (req, res) => {
  res.json({ count: notifications.unreadCount(req.user.id) });
});

router.post('/:id/read', requireAuth, (req, res) => {
  try { notifications.markRead(parseInt(req.params.id), req.user.id); res.json({ ok: true }); }
  catch (err) { log.error('notifications markRead', err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/read-all', requireAuth, (req, res) => {
  try { notifications.markAllRead(req.user.id); res.json({ ok: true }); }
  catch (err) { log.error('notifications markAllRead', err); res.status(500).json({ error: 'Internal server error' }); }
});

router.delete('/:id', requireAuth, (req, res) => {
  try { notifications.delete(parseInt(req.params.id), req.user.id); res.json({ ok: true }); }
  catch (err) { log.error('notifications delete', err); res.status(500).json({ error: 'Internal server error' }); }
});

router.post('/bulk', requireAuth, (req, res) => {
  try {
    const { ids, action } = req.body;
    if (!ids || !Array.isArray(ids) || !['read', 'delete'].includes(action)) {
      return res.status(400).json({ error: 'ids (array) and action (read|delete) required' });
    }
    notifications.bulkAction(ids.map(id => parseInt(id)), req.user.id, action);
    res.json({ ok: true });
  } catch (err) { log.error('notifications bulkAction', err); res.status(500).json({ error: 'Internal server error' }); }
});


module.exports = router;
