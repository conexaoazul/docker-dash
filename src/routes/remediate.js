'use strict';

// Remediation Wizard routes — v6.6
// See docs/planning/v6.6/remediation-wizard/01-feature-spec.md §8

const { Router } = require('express');
const { requireAuth, requireRole, writeable } = require('../middleware/auth');
const { getClientIp } = require('../utils/helpers');
const auditService = require('../services/audit');
const { getDb } = require('../db');
const log = require('../utils/logger')('remediate');

const catalog = require('../services/remediation-catalog');
const remediate = require('../services/remediate');

const router = Router();

// ─── Catalog ───────────────────────────────────────────

// GET /findings/codes — list all catalog entries (metadata only)
router.get('/findings/codes', requireAuth, requireRole('admin', 'operator'), (req, res) => {
  try {
    res.json({ codes: catalog.list() });
  } catch (err) {
    log.error('list codes', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /config — runtime config (v6.9.0: rollback window + snapshot retention)
// so the UI can display actual values instead of hard-coding "60 seconds"
router.get('/config', requireAuth, requireRole('admin', 'operator'), (req, res) => {
  try {
    res.json(remediate.getRollbackConfig());
  } catch (err) {
    log.error('get config', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Plan ──────────────────────────────────────────────

// POST /plan — build a remediation plan
router.post('/plan', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const { scope, findings } = req.body || {};
    if (!scope || !scope.type) return res.status(400).json({ error: 'scope.type required' });
    if (!Array.isArray(findings) || findings.length === 0) {
      return res.status(400).json({ error: 'findings array required' });
    }

    // Resolve scope → list of container refs
    let containers;
    if (scope.type === 'container') {
      if (!scope.id) return res.status(400).json({ error: 'scope.id required for container scope' });
      containers = [{ id: scope.id, hostId: scope.hostId || 0 }];
    } else if (scope.type === 'stack') {
      if (!scope.name) return res.status(400).json({ error: 'scope.name required for stack scope' });
      containers = await _resolveStackContainers(scope.name, scope.hostId || 0);
      if (containers.length === 0) {
        return res.status(404).json({ error: `No containers found for stack '${scope.name}'` });
      }
    } else {
      return res.status(400).json({ error: `Unknown scope.type: ${scope.type}` });
    }

    const planObj = await remediate.plan({ containers, findings });

    auditService.log({
      userId: req.user.id, username: req.user.username,
      action: 'remediate_plan', targetType: scope.type, targetId: String(scope.id || scope.name),
      details: {
        scopeType: scope.type,
        containerCount: containers.length,
        findings,
        stepsCount: planObj.steps.length,
        totalDowntimeMs: planObj.totalDowntimeMs,
      },
      ip: getClientIp(req),
    });

    res.json(planObj);
  } catch (err) {
    log.error('plan', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Apply ─────────────────────────────────────────────

// POST /apply — create a job from a plan and execute async
router.post('/apply', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const { plan, mode, scope, scheduledAt } = req.body || {};
    if (!plan || !Array.isArray(plan.steps)) return res.status(400).json({ error: 'plan with steps array required' });
    if (!['apply-local', 'pr', 'artifact'].includes(mode)) {
      return res.status(400).json({ error: `Invalid mode: ${mode}` });
    }
    if (!scope || !scope.type || (!scope.id && !scope.name)) {
      return res.status(400).json({ error: 'scope required' });
    }

    let job;
    try {
      job = remediate.createJob({
        plan, mode, userId: req.user.id,
        hostId: scope.hostId || 0,
        scope: { type: scope.type, id: scope.id || scope.name },
        scheduledAt: scheduledAt || null,
      });
    } catch (e) {
      if (e.code === 'CONCURRENT_JOB') {
        return res.status(409).json({ error: e.message, existingJobId: e.existingJobId });
      }
      if (/scheduledAt/i.test(e.message)) {
        return res.status(400).json({ error: e.message });
      }
      throw e;
    }

    // Kick off async ONLY if not scheduled — scheduler picks it up later
    if (!job.scheduled) {
      remediate.runJob(job.jobId).catch(err => log.error('async run failed', { jobId: job.jobId, error: err.message }));
    }

    auditService.log({
      userId: req.user.id, username: req.user.username,
      action: job.scheduled ? 'remediate_scheduled' : 'remediate_apply_start',
      targetType: scope.type, targetId: String(scope.id || scope.name),
      details: { jobId: job.jobId, mode, planId: plan.planId, stepsCount: plan.steps.length, scheduledAt: job.scheduledAt || null },
      ip: getClientIp(req),
    });

    res.status(202).json({ jobId: job.jobId, scheduled: job.scheduled, scheduledAt: job.scheduledAt || null });
  } catch (err) {
    log.error('apply', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Job status ────────────────────────────────────────

// GET /job/:id
router.get('/job/:id', requireAuth, requireRole('admin', 'operator'), (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare(`
      SELECT id, mode, scope_type AS scopeType, scope_id AS scopeId, host_id AS hostId,
             status, current_step AS currentStep, output, error_class AS errorClass,
             score_before AS scoreBefore, score_after AS scoreAfter,
             git_branch AS gitBranch, git_pr_url AS gitPrUrl,
             rollback_deadline AS rollbackDeadline,
             created_by AS createdBy, created_at AS createdAt,
             started_at AS startedAt, completed_at AS completedAt
      FROM remediation_jobs WHERE id = ?
    `).get(parseInt(req.params.id));
    if (!row) return res.status(404).json({ error: 'Job not found' });
    res.json(row);
  } catch (err) {
    log.error('get job', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /job/:id/rollback (within rollback_deadline)
router.post('/job/:id/rollback', requireAuth, requireRole('admin'), writeable, async (req, res) => {
  try {
    const jobId = parseInt(req.params.id);
    const db = getDb();
    const row = db.prepare('SELECT id, status, rollback_deadline, scope_type, scope_id FROM remediation_jobs WHERE id = ?').get(jobId);
    if (!row) return res.status(404).json({ error: 'Job not found' });
    if (row.status !== 'success') return res.status(409).json({ error: `Cannot rollback job in status '${row.status}'` });
    if (!row.rollback_deadline || new Date(row.rollback_deadline) < new Date()) {
      return res.status(409).json({ error: 'Rollback window has expired (60s after success)' });
    }

    // Kick off async — respond 202 + client polls /job/:id
    remediate.executeRollback(jobId).catch(err =>
      log.error('async rollback failed', { jobId, error: err.message })
    );

    auditService.log({
      userId: req.user.id, username: req.user.username,
      action: 'remediate_rollback', targetType: row.scope_type, targetId: row.scope_id,
      details: { jobId, reason: 'manual' },
      ip: getClientIp(req),
    });

    res.status(202).json({ ok: true, jobId });
  } catch (err) {
    log.error('rollback', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /jobs — list recent jobs
router.get('/jobs', requireAuth, requireRole('admin', 'operator'), (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, mode, scope_type AS scopeType, scope_id AS scopeId, status,
             current_step AS currentStep, error_class AS errorClass,
             created_by AS createdBy, created_at AS createdAt,
             completed_at AS completedAt
      FROM remediation_jobs
      ORDER BY id DESC LIMIT ?
    `).all(limit);
    res.json({ jobs: rows });
  } catch (err) {
    log.error('list jobs', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Helpers ───────────────────────────────────────────

async function _resolveStackContainers(stackName, hostId) {
  const dockerService = require('../services/docker');
  const docker = dockerService.getDocker(hostId || 0);
  const all = await docker.listContainers({
    all: true,
    filters: { label: [`com.docker.compose.project=${stackName}`] },
  });
  return all.map(c => ({ id: c.Id, hostId: hostId || 0 }));
}

module.exports = router;
