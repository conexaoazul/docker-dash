'use strict';

// Docker Runner — v6.6 Remediation Wizard
//
// Executes container recreation in dependency order with health checks.
// Per preflight A5 (0/10 popular images have HEALTHCHECK), we detect
// "healthy" via State.Running + RestartCount delta — not Docker healthcheck.
//
// Spec: docs/planning/v6.6/remediation-wizard/02-deep-spec.md §3-4

const { execFileSync, spawn } = require('child_process');
const path = require('path');
const log = require('../utils/logger')('docker-runner');
const dockerService = require('./docker');

// ─── Topological sort by depends_on ────────────────────

/**
 * Order services by depends_on so dependencies recreate first.
 * @param {object} composeDoc - parsed compose (JS object, not YAML Node)
 * @param {string[]} servicesToTouch - subset of services that need recreate
 * @returns {string[]} ordered (deps first)
 */
function topoOrder(composeDoc, servicesToTouch) {
  const services = composeDoc.services || {};
  const visited = new Set();
  const visiting = new Set();  // cycle detection
  const result = [];

  function visit(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      log.warn(`Cycle in depends_on at service '${name}' — skipping`);
      return;
    }
    visiting.add(name);
    const deps = services[name]?.depends_on;
    const depList = Array.isArray(deps) ? deps : (deps && typeof deps === 'object' ? Object.keys(deps) : []);
    for (const d of depList) {
      if (servicesToTouch.includes(d)) visit(d);
    }
    visiting.delete(name);
    visited.add(name);
    result.push(name);
  }

  for (const s of servicesToTouch) visit(s);
  return result;
}

// ─── Health detection ─────────────────────────────────

/**
 * Wait for a container to look "healthy" after recreate.
 * Per preflight A5 (most images lack HEALTHCHECK), we primarily rely on:
 *   1. State.Running === true
 *   2. RestartCount didn't increase (no crash-loop)
 *   3. Optional: State.Health.Status === 'healthy' if healthcheck defined
 *
 * @param {object} docker - dockerode client
 * @param {string} containerId
 * @param {number} timeoutMs
 * @returns {Promise<{ok: boolean, reason: string, state: object}>}
 */
async function waitHealthy(docker, containerId, timeoutMs = 30_000) {
  const start = Date.now();
  let baselineRestartCount = null;

  while (Date.now() - start < timeoutMs) {
    try {
      const inspect = await docker.getContainer(containerId).inspect();
      const state = inspect.State || {};
      if (baselineRestartCount === null) baselineRestartCount = inspect.RestartCount || 0;

      // Crash-loop check
      if ((inspect.RestartCount || 0) > baselineRestartCount + 1) {
        return { ok: false, reason: 'crash_loop', state };
      }

      // Not running check
      if (state.Status === 'exited' || state.Status === 'dead' || state.OOMKilled) {
        return { ok: false, reason: 'not_running:' + state.Status, state };
      }

      // Explicit healthcheck if present
      if (state.Health && state.Health.Status) {
        if (state.Health.Status === 'healthy') return { ok: true, reason: 'healthcheck_ok', state };
        if (state.Health.Status === 'unhealthy') return { ok: false, reason: 'healthcheck_unhealthy', state };
        // 'starting' → keep waiting
      } else if (state.Running === true) {
        // No healthcheck — wait 5s past startup to catch early crash-loops
        if (Date.now() - start >= 5000) return { ok: true, reason: 'running_no_healthcheck', state };
      }
    } catch (e) {
      // Container might have been removed during our poll
      return { ok: false, reason: 'inspect_failed:' + e.message };
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  return { ok: false, reason: 'timeout_after_' + timeoutMs + 'ms' };
}

// ─── Compose recreate ─────────────────────────────────

/**
 * Run docker compose up -d --no-deps --force-recreate for ONE service.
 * @param {string} composeFile - absolute path
 * @param {string} serviceName
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
function composeRecreate(composeFile, serviceName) {
  return new Promise((resolve, reject) => {
    const cwd = path.dirname(composeFile);
    const args = ['compose', '-f', composeFile, 'up', '-d', '--no-deps', '--force-recreate', serviceName];
    const proc = spawn('docker', args, { cwd, timeout: 120_000 });
    let stdout = '', stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`docker compose exited ${code}: ${stderr}`));
      resolve({ stdout, stderr });
    });
  });
}

/**
 * Recreate a set of services in dependency order, waiting for each to be
 * healthy before moving to the next. Aborts + throws on first failure.
 *
 * @param {object} args
 * @param {string} args.composeFile - absolute path
 * @param {object} args.composeDoc - parsed compose (JS object)
 * @param {string[]} args.services - service names to recreate
 * @param {object} args.docker - dockerode client for health polling
 * @param {number} args.hostId
 * @param {function(string)} args.onLog - log callback
 */
async function recreateInOrder({ composeFile, composeDoc, services, docker, hostId, onLog }) {
  const order = topoOrder(composeDoc, services);
  onLog(`[runner] Recreate order: ${order.join(' → ')}`);

  for (const service of order) {
    onLog(`[runner] Recreating ${service}...`);
    await composeRecreate(composeFile, service);

    // Find the new container ID via compose project label
    const projectName = path.basename(path.dirname(composeFile));
    const matches = await docker.listContainers({
      all: true,
      filters: { label: [`com.docker.compose.service=${service}`, `com.docker.compose.project=${projectName}`] },
    });
    if (matches.length === 0) {
      // Project label might differ from dirname; fall back to service label only
      const loose = await docker.listContainers({
        all: true,
        filters: { label: [`com.docker.compose.service=${service}`] },
      });
      if (loose.length === 0) {
        onLog(`[runner] ⚠ Cannot find recreated container for ${service}; continuing`);
        continue;
      }
      matches.push(loose[loose.length - 1]);
    }
    const newContainer = matches[matches.length - 1];

    onLog(`[runner] Waiting for ${service} to be healthy...`);
    const health = await waitHealthy(docker, newContainer.Id, 30_000);
    if (!health.ok) {
      onLog(`[runner] ✗ ${service} failed health check: ${health.reason}`);
      const err = new Error(`Service '${service}' failed health check: ${health.reason}`);
      err.code = 'HEALTH_FAILED';
      err.service = service;
      err.health = health;
      throw err;
    }
    onLog(`[runner] ✓ ${service} healthy`);
  }
}

// ─── Rollback ─────────────────────────────────────────

/**
 * Restore compose file to pre-apply snapshot + force-recreate affected services.
 *
 * @param {object} args
 * @param {object} args.snapshots - { containerId: {inspect, composeFileContent} }
 * @param {function(string)} args.onLog
 * @param {number} args.hostId
 */
async function rollback({ snapshots, onLog, hostId }) {
  const fs = require('fs');
  const YAML = require('yaml');
  const docker = dockerService.getDocker(hostId || 0);

  // Group snapshots by compose file
  const byComposeFile = {};
  for (const [containerId, snap] of Object.entries(snapshots)) {
    const composeFile = snap.inspect?.Config?.Labels?.['com.docker.compose.project.config_files']?.split(',')[0];
    if (!composeFile || !snap.composeFileContent) continue;
    if (!byComposeFile[composeFile]) byComposeFile[composeFile] = [];
    const service = snap.inspect.Config.Labels['com.docker.compose.service'];
    byComposeFile[composeFile].push({ containerId, service, snap });
  }

  for (const [composeFile, entries] of Object.entries(byComposeFile)) {
    onLog(`[rollback] Restoring ${composeFile}`);
    try {
      // Write pre-apply content back
      fs.writeFileSync(composeFile + '.rollback-tmp', entries[0].snap.composeFileContent, 'utf8');
      fs.renameSync(composeFile + '.rollback-tmp', composeFile);

      const doc = YAML.parse(entries[0].snap.composeFileContent);
      const services = entries.map(e => e.service).filter(Boolean);
      await recreateInOrder({
        composeFile,
        composeDoc: doc,
        services,
        docker,
        hostId,
        onLog: (msg) => onLog('[rollback] ' + msg),
      });
      onLog(`[rollback] ✓ ${composeFile} restored`);
    } catch (e) {
      onLog(`[rollback] ✗ Rollback of ${composeFile} failed: ${e.message}`);
      throw e;  // rollback failure is critical — bubble up
    }
  }
}

module.exports = {
  topoOrder,
  waitHealthy,
  composeRecreate,
  recreateInOrder,
  rollback,
};
