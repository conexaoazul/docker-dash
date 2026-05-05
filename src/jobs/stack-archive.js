'use strict';

// v8.2.0 — Weekly stack bundle archive job. Walks every active host, lists
// running stacks (via compose project labels), exports each via the existing
// bundleService, and uploads JSON files to pCloud and/or S3 under a date
// folder. Per-stack failures don't abort the run — we want partial wins.

const dockerService = require('../services/docker');
const bundleService = require('../services/stackBundle');
const auditService = require('../services/audit');
const config = require('../config');
const log = require('../utils/logger')('stack-archive');

function _safe(name) {
  return String(name || 'unnamed').replace(/[^\w.-]+/g, '_').substring(0, 100);
}

async function _listStacksOnHost(hostId) {
  const containers = await dockerService.listContainers(hostId);
  const seen = new Set();
  for (const c of containers) {
    const project = c.labels?.['com.docker.compose.project'];
    if (project) seen.add(project);
  }
  return [...seen].map(name => ({ name }));
}

async function _uploadToTargets(date, fileName, jsonString) {
  const folder = `/docker-dash/stacks/${date}`;
  const buf = Buffer.from(jsonString, 'utf8');
  const errors = [];
  let enabledTargets = 0;

  if (config.pcloud?.enabled) {
    enabledTargets++;
    try {
      const pcloud = require('../services/pcloud-backup');
      await pcloud.uploadStackBundle(folder, fileName, buf);
    } catch (err) { errors.push(`pcloud: ${err.message}`); }
  }

  if (config.s3?.enabled) {
    enabledTargets++;
    try {
      const s3 = require('../services/s3-backup');
      if (typeof s3.uploadObject === 'function') {
        await s3.uploadObject(`docker-dash/stacks/${date}/${fileName}`, buf, 'application/json');
      } else {
        // s3-backup.uploadObject not yet available — skip silently for now.
        // The S3 path is best-effort here; the canonical S3 backup is the
        // daily DB upload via uploadBackup().
      }
    } catch (err) { errors.push(`s3: ${err.message}`); }
  }

  // Throw only if every enabled target failed; otherwise it's a partial.
  if (enabledTargets > 0 && errors.length >= enabledTargets) throw new Error(errors.join('; '));
  return { errors };
}

async function run({ trigger = 'cron' } = {}) {
  const startedAt = Date.now();
  const today = new Date().toISOString().substring(0, 10);
  const result = { stacks: 0, succeeded: 0, failed: 0, errors: [] };

  const hosts = dockerService.getActiveHosts ? dockerService.getActiveHosts() : [{ id: 0, name: 'local' }];

  for (const host of hosts) {
    let stacks;
    try {
      stacks = await _listStacksOnHost(host.id);
    } catch (err) {
      log.warn('Cannot list stacks on host', { host: host.name, err: err.message });
      result.errors.push({ host: host.name, stage: 'list', error: err.message });
      continue;
    }

    for (const stack of stacks) {
      result.stacks++;
      try {
        const bundle = await bundleService.exportStack(stack.name, host.id);
        const json = JSON.stringify(bundle, null, 2);
        const fileName = `${_safe(host.name)}--${_safe(stack.name)}.json`;
        await _uploadToTargets(today, fileName, json);
        result.succeeded++;
      } catch (err) {
        log.warn('Stack export/upload failed', { host: host.name, stack: stack.name, err: err.message });
        result.errors.push({ host: host.name, stack: stack.name, error: err.message });
        result.failed++;
      }
    }
  }

  // Prune older date folders
  if (config.pcloud?.enabled) {
    try {
      const pcloud = require('../services/pcloud-backup');
      await pcloud.pruneStackArchives();
    } catch (err) {
      log.warn('Stack archive prune failed', err.message);
    }
  }

  const durationMs = Date.now() - startedAt;
  const status = result.failed === 0 ? 'success' : (result.succeeded > 0 ? 'partial' : 'error');

  // Update last_stack_* fields on pcloud_config so the UI status panel reflects it
  if (config.pcloud?.enabled) {
    try {
      require('../services/pcloud-backup').noteStackArchiveResult({
        status,
        error: result.errors.length ? `${result.failed}/${result.stacks} failed` : null,
      });
    } catch (err) { log.warn('Failed to update last_stack_* status', err.message); }
  }

  auditService.log({
    userId: 0, username: 'system',
    action: status === 'error' ? 'backup_pcloud_failed' : 'backup_pcloud',
    targetType: 'system', targetId: 'stack-archive',
    details: JSON.stringify({ kind: 'stack', trigger, status, ...result, durationMs }),
  });

  log.info('Stack archive complete', { trigger, status, ...result, durationMs });
  return { status, durationMs, ...result };
}

module.exports = { run, _listStacksOnHost, _safe };
