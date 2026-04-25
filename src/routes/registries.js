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

// v7.5.0 — Manifest inspect for the Browse page. Returns the raw manifest
// (so the UI can show layer count + sizes), digest, and content type.
router.get('/:id/manifest/*ref', requireAuth, asyncHandler(async (req, res) => {
  // splat is "<repo>/...":<tag-or-digest>". Repo can have slashes; the LAST
  // colon-separated chunk is the ref. Example: "library/nginx:latest" →
  // repo="library/nginx", ref="latest". Digest refs include their own
  // colon ("sha256:...") so we split from the right after a "@" or last ":".
  const raw = Array.isArray(req.params.ref) ? req.params.ref.join('/') : req.params.ref;
  let repo, ref;
  if (raw.includes('@')) {
    [repo, ref] = raw.split('@');
  } else {
    const lastColon = raw.lastIndexOf(':');
    if (lastColon === -1) return res.status(400).json({ error: 'ref must be repo:tag or repo@digest' });
    repo = raw.substring(0, lastColon);
    ref = raw.substring(lastColon + 1);
  }
  const data = await registryService.manifest(parseInt(req.params.id), repo, ref);
  res.json(data);
}));

// v7.5.0 — Push action. Tags + pushes a local image to the configured
// registry; streams progress as SSE (text/event-stream) so the UI can show
// per-layer progress in real time. Operator + admin only; admin-only would
// be too strict (operators manage app deployments). Audited on success or
// failure, with the size of the pushed image when known.
router.post('/:id/push', requireAuth, requireRole('admin', 'operator'), writeable, asyncHandler(async (req, res) => {
  const { sourceImage, targetRepo, targetTag } = req.body || {};
  if (!sourceImage || !targetRepo || !targetTag) {
    return res.status(400).json({ error: 'sourceImage, targetRepo, targetTag are all required' });
  }

  const dockerService = require('../services/docker');
  const startedAt = Date.now();

  let push;
  try {
    push = await registryService.pushImage(
      dockerService, req.hostId, parseInt(req.params.id),
      sourceImage, targetRepo, targetTag,
    );
  } catch (err) {
    auditService.log({
      userId: req.user.id, username: req.user.username,
      action: 'registry_push_failed', targetType: 'image', targetId: sourceImage,
      details: { error: err.message.substring(0, 300), targetRepo, targetTag },
      ip: getClientIp(req),
    });
    return res.status(502).json({ error: err.message });
  }

  // Stream NDJSON push events to the client as SSE. Each layer/status line
  // gets one `data:` event. On error inside the stream we still send a final
  // event so the UI can show the message; HTTP status stays 200 because we
  // already sent headers.
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',  // disable nginx/Caddy buffering for this response
  });

  let pushFailed = false;
  let lastError = null;

  const docker = dockerService.getDocker(req.hostId);
  docker.modem.followProgress(push.stream,
    (err) => {
      if (err || pushFailed) {
        const msg = (err?.message) || lastError || 'Push failed';
        try { res.write(`event: error\ndata: ${JSON.stringify({ error: msg })}\n\n`); } catch { /* client closed */ }
        auditService.log({
          userId: req.user.id, username: req.user.username,
          action: 'registry_push_failed', targetType: 'image', targetId: push.fullImage,
          details: {
            error: msg.substring(0, 300),
            registry: push.registry,
            sourceImage, targetRepo, targetTag,
            durationMs: Date.now() - startedAt,
          },
          ip: getClientIp(req),
        });
      } else {
        try { res.write(`event: done\ndata: ${JSON.stringify({ ok: true, image: push.fullImage })}\n\n`); } catch { /* client closed */ }
        auditService.log({
          userId: req.user.id, username: req.user.username,
          action: 'registry_push', targetType: 'image', targetId: push.fullImage,
          details: {
            registry: push.registry,
            sourceImage, targetRepo, targetTag,
            durationMs: Date.now() - startedAt,
          },
          ip: getClientIp(req),
        });
      }
      try { res.end(); } catch { /* already ended */ }
    },
    (event) => {
      // Each progress event: { status, id?, progressDetail?, error? }
      if (event && event.error) {
        pushFailed = true;
        lastError = event.error;
      }
      try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* client closed */ }
    }
  );
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
