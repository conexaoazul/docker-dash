'use strict';

const { Router } = require('express');
const securityAlerts = require('../services/securityAlerts');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// List all security alert rules (admin only)
router.get('/rules', requireAuth, requireRole('admin'), asyncHandler((req, res) => {
  res.json(securityAlerts.listRules());
}));

// Create a new security alert rule (admin only)
router.post('/rules', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const result = securityAlerts.createRule(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Update a security alert rule (admin only)
router.put('/rules/:id', requireAuth, requireRole('admin'), asyncHandler((req, res) => {
  securityAlerts.updateRule(parseInt(req.params.id), req.body);
  res.json({ ok: true });
}));

// Delete a security alert rule (admin only)
router.delete('/rules/:id', requireAuth, requireRole('admin'), asyncHandler((req, res) => {
  securityAlerts.deleteRule(parseInt(req.params.id));
  res.json({ ok: true });
}));

// Get recent security alerts (admin only)
router.get('/recent', requireAuth, requireRole('admin'), asyncHandler((req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  res.json(securityAlerts.getRecentAlerts(hours));
}));

// Test-fire a security alert rule (admin only)
router.post('/test/:id', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await securityAlerts.testRule(parseInt(req.params.id));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
