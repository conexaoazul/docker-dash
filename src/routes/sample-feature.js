'use strict';

// Sample feature routes — v7.4.0 — CONTRIBUTOR DEMO
//
// REST surface for the sample feature. Demonstrates the standard route
// patterns: requireAuth, requireRole, asyncHandler, audit logging.
//
//   GET    /api/sample-feature/counter   — read counter (any authenticated user)
//   POST   /api/sample-feature/increment — add 1 (operator + admin)
//   POST   /api/sample-feature/reset     — reset to 0 (admin only, audited)
//
// Mount point in src/server.js:
//   app.use('/api/sample-feature', apiLimiter, require('./routes/sample-feature'));

const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const sampleFeature = require('../services/sample-feature');
const auditService = require('../services/audit');

const router = Router();

router.use(requireAuth);

// Read — any authenticated user can see the counter. Sample features that
// expose secrets or sensitive data should use requireRole('admin') instead.
router.get('/counter', asyncHandler(async (req, res) => {
  res.json({ count: sampleFeature.getCount() });
}));

// Mutate — operator + admin can increment. Viewers cannot. This shows the
// requireRole pattern with multiple allowed roles.
router.post('/increment', requireRole('admin', 'operator'), asyncHandler(async (req, res) => {
  const result = sampleFeature.increment({ source: 'manual' });
  res.json(result);
}));

// Reset — admin only, with audit. Any destructive operation should follow
// this exact shape: requireRole('admin') + auditService.log(). Audit
// entries are queryable via /api/audit and visible in the audit page.
router.post('/reset', requireRole('admin'), asyncHandler(async (req, res) => {
  const before = sampleFeature.getCount();
  const result = sampleFeature.reset();
  auditService.log({
    userId: req.user.id,
    username: req.user.username,
    action: 'sample_feature_reset',
    targetType: 'sample-feature',
    targetId: 'counter',
    details: { previousValue: before },
  });
  res.json(result);
}));

module.exports = router;
