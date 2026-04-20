'use strict';

// Outbound Network Filter routes — v6.7 (alpha.1)
// Spec: docs/planning/v6.7/outbound-filter/01-feature-spec.md §3
//
// This alpha exposes the CRUD surface. Policies created here are persisted
// but NOT enforced until the rc2 sidecar lands. API responses include an
// `enforced: false` flag so frontends can surface "config only" UX.

const { Router } = require('express');
const { requireAuth, requireRole, writeable } = require('../middleware/auth');
const { getClientIp } = require('../utils/helpers');
const auditService = require('../services/audit');
const dockerService = require('../services/docker');
const egressFilter = require('../services/egress-filter');
const log = require('../utils/logger')('egress-filter');

const router = Router();

// v6.7-rc2 flips this to true once the sidecar ships.
const ENFORCEMENT_ACTIVE = false;

// ─── Presets ────────────────────────────────────────────

// GET /presets — return the catalog of preset allowlists
router.get('/presets', requireAuth, requireRole('admin'), (_req, res) => {
  try {
    res.json({
      presets: egressFilter.listPresets(),
      imdsAlwaysBlocked: egressFilter._internals.IMDS_ENDPOINTS,
      enforced: ENFORCEMENT_ACTIVE,
    });
  } catch (err) {
    log.error('list presets', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Policy CRUD ────────────────────────────────────────

// GET /policies — list active policies (optional host filter)
router.get('/policies', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const hostId = req.query.hostId != null ? parseInt(req.query.hostId, 10) : undefined;
    res.json({
      policies: egressFilter.listPolicies({ hostId }),
      enforced: ENFORCEMENT_ACTIVE,
    });
  } catch (err) {
    log.error('list policies', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /policies/:id — show one
router.get('/policies/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const policy = egressFilter.getPolicy(id);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    res.json({ policy, enforced: ENFORCEMENT_ACTIVE });
  } catch (err) {
    log.error('get policy', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /policies — create or upsert
router.post('/policies', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const { scopeType, scopeKey, hostId, preset, customAllowlist, mode } = req.body || {};

    if (!['container', 'stack'].includes(scopeType)) {
      return res.status(400).json({ error: 'scopeType must be "container" or "stack"' });
    }
    if (!scopeKey || typeof scopeKey !== 'string') {
      return res.status(400).json({ error: 'scopeKey is required' });
    }
    if (scopeType === 'container' && !/^[a-f0-9]{12,64}$/.test(scopeKey)) {
      return res.status(400).json({ error: 'scopeKey must be a Docker container id (12-64 hex chars)' });
    }

    // Precondition: for container scope, verify the target isn't privileged / NET_ADMIN / etc.
    if (scopeType === 'container') {
      try {
        const docker = dockerService.getDocker(hostId || 0);
        const inspect = await docker.getContainer(scopeKey).inspect();
        const precheck = egressFilter.canApplyFilter(inspect);
        if (!precheck.ok) {
          return res.status(422).json({ error: precheck.reason });
        }
      } catch (e) {
        // If the container can't be inspected, persist anyway (user may be pre-provisioning).
        // Log it but don't block. Real enforcement will re-check at apply time.
        log.warn('egress policy created without container precheck', { scopeKey, err: e.message });
      }
    }

    const result = egressFilter.createPolicy({
      scopeType,
      scopeKey,
      hostId: hostId || 0,
      preset,
      customAllowlist,
      mode,
      createdBy: req.user?.id,
    });

    await auditService.log({
      userId: req.user?.id,
      username: req.user?.username,
      ip: getClientIp(req),
      action: result.updated ? 'egress_policy_updated' : 'egress_policy_created',
      details: { policyId: result.policyId, scopeType, scopeKey, preset, mode: result.mode, allowlistSize: result.allowlist.length },
    });

    res.status(result.updated ? 200 : 201).json({
      ok: true,
      policyId: result.policyId,
      updated: result.updated,
      allowlist: result.allowlist,
      mode: result.mode,
      enforced: ENFORCEMENT_ACTIVE,
      note: ENFORCEMENT_ACTIVE
        ? undefined
        : 'Policy persisted but not enforced in this alpha. Enforcement lands in v6.7.0-rc2 (sidecar).',
    });
  } catch (err) {
    // Validation errors come from the service layer as regular Error
    const msg = err.message || 'Internal server error';
    if (/validation|required|Unknown preset|Invalid /i.test(msg)) {
      return res.status(400).json({ error: msg });
    }
    log.error('create egress policy', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /policies/:id — update (preset change, allowlist edit, mode flip)
router.patch('/policies/:id', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = egressFilter.getPolicy(id);
    if (!existing) return res.status(404).json({ error: 'Policy not found' });

    const updated = egressFilter.updatePolicy(id, req.body || {});

    await auditService.log({
      userId: req.user?.id,
      username: req.user?.username,
      ip: getClientIp(req),
      action: 'egress_policy_updated',
      details: { policyId: id, preset: updated.preset, mode: updated.mode, allowlistSize: updated.allowlist.length },
    });

    res.json({ ok: true, policy: updated, enforced: ENFORCEMENT_ACTIVE });
  } catch (err) {
    const msg = err.message || 'Internal server error';
    if (/validation|required|Unknown preset|Invalid /i.test(msg)) {
      return res.status(400).json({ error: msg });
    }
    log.error('update egress policy', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /policies/:id — emergency disable (soft-delete, active=0)
router.delete('/policies/:id', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = egressFilter.getPolicy(id);
    if (!existing) return res.status(404).json({ error: 'Policy not found' });

    const reason = (req.body && req.body.reason) || 'unspecified';
    egressFilter.removePolicy(id, { reason });

    await auditService.log({
      userId: req.user?.id,
      username: req.user?.username,
      ip: getClientIp(req),
      action: 'egress_emergency_disable',
      details: { policyId: id, scopeType: existing.scopeType, scopeKey: existing.scopeKey, reason },
    });

    res.json({ ok: true, removed: true, enforced: ENFORCEMENT_ACTIVE });
  } catch (err) {
    log.error('remove egress policy', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Block log ──────────────────────────────────────────

// GET /policies/:id/block-log — paginated deny log for this policy
router.get('/policies/:id/block-log', requireAuth, requireRole('admin'), (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const policy = egressFilter.getPolicy(id);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });

    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const sinceId = parseInt(req.query.sinceId, 10) || 0;
    const entries = egressFilter.getBlockLog(id, { limit, sinceId });

    res.json({
      entries,
      policyId: id,
      enforced: ENFORCEMENT_ACTIVE,
      note: ENFORCEMENT_ACTIVE
        ? undefined
        : 'Block log is empty in this alpha — no enforcement yet, nothing to log. Sidecar lands in v6.7.0-rc2.',
    });
  } catch (err) {
    log.error('block log', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
