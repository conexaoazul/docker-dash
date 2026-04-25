'use strict';

// Update-check routes — v7.3.0
//
//   GET  /api/system/update-check          — read current status (any auth user)
//   POST /api/system/update-check/refresh  — admin: force refresh (1/min throttled)
//   POST /api/system/update-check/setting  — admin: enable/disable

const { Router } = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireRole } = require('../middleware/auth');
const updateCheck = require('../services/update-check');
const auditService = require('../services/audit');

const router = Router();

router.use(requireAuth);

// Status — visible to all authenticated users so the sidebar badge works
// for non-admins too. Read-only, no PII, just version + cached release notes.
router.get('/', asyncHandler(async (req, res) => {
  res.json(updateCheck.getStatus());
}));

// Manual refresh — admin only. Service has a 60s anti-abuse throttle; if
// invoked sooner the call is a no-op and the existing cache is returned.
router.post('/refresh', requireRole('admin'), asyncHandler(async (req, res) => {
  const fresh = await updateCheck.refresh({ force: true });
  res.json({
    refreshed: !!fresh,
    status: updateCheck.getStatus(),
  });
}));

// Toggle the feature on/off. Disabling also stops the background job from
// hitting GitHub on the next tick.
router.post('/setting', requireRole('admin'), asyncHandler(async (req, res) => {
  const { enabled } = req.body || {};
  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'Body must be { enabled: boolean }' });
  }
  updateCheck.setEnabled(enabled, req.user.id);
  auditService.log({
    userId: req.user.id,
    username: req.user.username,
    action: enabled ? 'update_check_enabled' : 'update_check_disabled',
    targetType: 'system',
    targetId: 'update-check',
    details: {},
  });
  res.json({ enabled });
}));

module.exports = router;
