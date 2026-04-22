'use strict';

const { Router } = require('express');
const groups = require('../services/groups');
const auditService = require('../services/audit');
const { requireAuth, requireRole } = require('../middleware/auth');
const { getClientIp } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

// List groups (with member counts)
router.get('/', requireAuth, asyncHandler((req, res) => {
  const list = groups.list(req.user.id);
  res.json(list);
}));

// Reorder groups — MUST be before /:id to avoid matching "order" as id
router.put('/order', requireAuth, requireRole('admin', 'operator'), asyncHandler((req, res) => {
  const { order } = req.body;
  if (!order || !Array.isArray(order)) {
    return res.status(400).json({ error: 'order array required' });
  }
  groups.reorder(order);
  res.json({ ok: true });
}));

// Get single group with members
router.get('/:id', requireAuth, asyncHandler((req, res) => {
  const group = groups.get(parseInt(req.params.id), req.user.id);
  if (!group) return res.status(404).json({ error: 'Group not found' });
  res.json(group);
}));

// Create group
router.post('/', requireAuth, requireRole('admin', 'operator'), asyncHandler((req, res) => {
  const { name, color, icon, scope } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const result = groups.create({ name, color, icon, scope, userId: req.user.id, createdBy: req.user.id });
  auditService.log({ userId: req.user.id, username: req.user.username,
    action: 'group_create', details: { name }, ip: getClientIp(req) });
  res.status(201).json(result);
}));

// Update group
router.put('/:id', requireAuth, requireRole('admin', 'operator'), asyncHandler((req, res) => {
  const { name, color, icon } = req.body;
  groups.update(parseInt(req.params.id), { name, color, icon }, req.user.id);
  res.json({ ok: true });
}));

// Delete group
router.delete('/:id', requireAuth, requireRole('admin'), asyncHandler((req, res) => {
  groups.delete(parseInt(req.params.id), req.user.id);
  auditService.log({ userId: req.user.id, username: req.user.username,
    action: 'group_delete', details: { id: req.params.id }, ip: getClientIp(req) });
  res.json({ ok: true });
}));

// Add containers to group
router.post('/:id/containers', requireAuth, requireRole('admin', 'operator'), asyncHandler((req, res) => {
  const { containerIds } = req.body;
  if (!containerIds || !Array.isArray(containerIds)) {
    return res.status(400).json({ error: 'containerIds array required' });
  }
  groups.addContainers(parseInt(req.params.id), containerIds);
  res.json({ ok: true });
}));

// Remove container from group
router.delete('/:id/containers/:containerId', requireAuth, requireRole('admin', 'operator'), asyncHandler((req, res) => {
  groups.removeContainer(parseInt(req.params.id), req.params.containerId);
  res.json({ ok: true });
}));

module.exports = router;
