'use strict';

const { Router } = require('express');
const registryService = require('../services/registry');
const auditService = require('../services/audit');
const { requireAuth, requireRole, writeable } = require('../middleware/auth');
const { getClientIp } = require('../utils/helpers');
const asyncHandler = require('../utils/asyncHandler');

const router = Router();

router.get('/', requireAuth, requireRole('admin'), asyncHandler((req, res) => {
  res.json(registryService.list());
}));

router.post('/', requireAuth, requireRole('admin'), writeable, asyncHandler((req, res) => {
  const { name, url, username, password } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'name and url required' });
  const id = registryService.create({ name, url, username, password, createdBy: req.user.id });
  auditService.log({
    userId: req.user.id, username: req.user.username,
    action: 'registry_create', targetType: 'registry', targetId: String(id),
    details: { name, url }, ip: getClientIp(req),
  });
  res.status(201).json({ id, name, url });
}));

router.put('/:id', requireAuth, requireRole('admin'), writeable, asyncHandler((req, res) => {
  const { name, url, username, password } = req.body;
  registryService.update(parseInt(req.params.id), { name, url, username, password });
  res.json({ ok: true });
}));

router.delete('/:id', requireAuth, requireRole('admin'), writeable, asyncHandler((req, res) => {
  registryService.remove(parseInt(req.params.id));
  auditService.log({
    userId: req.user.id, username: req.user.username,
    action: 'registry_delete', targetType: 'registry', targetId: req.params.id,
    ip: getClientIp(req),
  });
  res.json({ ok: true });
}));

router.post('/:id/test', requireAuth, requireRole('admin'), asyncHandler(async (req, res) => {
  const result = await registryService.testConnection(parseInt(req.params.id));
  res.json(result);
}));

router.get('/:id/catalog', requireAuth, asyncHandler(async (req, res) => {
  const repos = await registryService.catalog(parseInt(req.params.id));
  res.json(repos);
}));

router.get('/:id/tags/*repo', requireAuth, asyncHandler(async (req, res) => {
  // Express 5 / path-to-regexp v8 returns splat params as arrays. Re-join
  // so downstream code keeps receiving "library/nginx"-style strings.
  const repo = Array.isArray(req.params.repo) ? req.params.repo.join('/') : req.params.repo;
  const tags = await registryService.tags(parseInt(req.params.id), repo);
  res.json(tags);
}));

// Pull image from a configured registry
router.post('/:id/pull', requireAuth, requireRole('admin', 'operator'), writeable, asyncHandler(async (req, res) => {
  const { image, tag } = req.body;
  if (!image) return res.status(400).json({ error: 'image name is required' });

  const registry = registryService.get(parseInt(req.params.id));
  if (!registry) return res.status(404).json({ error: 'Registry not found' });

  // Build full image name with registry prefix
  const registryHost = new URL(registry.url).host;
  const fullImage = `${registryHost}/${image}:${tag || 'latest'}`;

  // Get Docker and pull with auth
  const dockerService = require('../services/docker');
  const docker = dockerService.getDocker(req.hostId);

  const auth = registryService.getAuthForImage(fullImage);
  await new Promise((resolve, reject) => {
    const opts = auth ? { authconfig: auth } : {};
    docker.pull(fullImage, opts, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (err2) => err2 ? reject(err2) : resolve());
    });
  });

  auditService.log({
    userId: req.user.id, username: req.user.username,
    action: 'registry_pull', targetType: 'image', targetId: fullImage,
    details: { registry: registry.name, image: fullImage }, ip: getClientIp(req),
  });

  res.json({ ok: true, image: fullImage });
}));

module.exports = router;
