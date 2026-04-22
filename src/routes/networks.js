'use strict';

const { Router } = require('express');
const dockerService = require('../services/docker');
const auditService = require('../services/audit');
const { requireAuth, requireRole, writeable } = require('../middleware/auth');
const { getClientIp } = require('../utils/helpers');

const { extractHostId } = require('../middleware/hostId');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();
router.use(extractHostId);

router.get('/', requireAuth, asyncHandler(async (req, res) => {
  res.json(await dockerService.listNetworks(req.hostId));
}));

router.get('/:id/inspect', requireAuth, asyncHandler(async (req, res) => {
  res.json(await dockerService.inspectNetwork(req.params.id, req.hostId));
}));

router.post('/', requireAuth, requireRole('admin'), writeable, asyncHandler(async (req, res) => {
  const result = await dockerService.createNetwork(req.body, req.hostId);
  auditService.log({ userId: req.user.id, username: req.user.username,
    action: 'network_create', targetType: 'network', details: req.body, ip: getClientIp(req) });
  res.status(201).json(result);
}));

router.delete('/:id', requireAuth, requireRole('admin'), writeable, asyncHandler(async (req, res) => {
  await dockerService.removeNetwork(req.params.id, req.hostId);
  auditService.log({ userId: req.user.id, username: req.user.username,
    action: 'network_remove', targetType: 'network', targetId: req.params.id, ip: getClientIp(req) });
  res.json({ ok: true });
}));

// Connect container to network
router.post('/:id/connect', requireAuth, requireRole('admin', 'operator'), writeable, asyncHandler(async (req, res) => {
  const { containerId } = req.body;
  if (!containerId) return res.status(400).json({ error: 'containerId required' });
  const docker = dockerService.getDocker(req.hostId);
  const network = docker.getNetwork(req.params.id);
  await network.connect({ Container: containerId });
  auditService.log({
    userId: req.user.id, username: req.user.username,
    action: 'network_connect', targetType: 'network', targetId: req.params.id,
    details: { containerId }, ip: getClientIp(req),
  });
  res.json({ ok: true });
}));

// Disconnect container from network
router.post('/:id/disconnect', requireAuth, requireRole('admin', 'operator'), writeable, asyncHandler(async (req, res) => {
  const { containerId } = req.body;
  if (!containerId) return res.status(400).json({ error: 'containerId required' });
  const docker = dockerService.getDocker(req.hostId);
  const network = docker.getNetwork(req.params.id);
  await network.disconnect({ Container: containerId });
  auditService.log({
    userId: req.user.id, username: req.user.username,
    action: 'network_disconnect', targetType: 'network', targetId: req.params.id,
    details: { containerId }, ip: getClientIp(req),
  });
  res.json({ ok: true });
}));

module.exports = router;
