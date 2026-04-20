'use strict';

// Remediation Orchestrator — v6.6
// See docs/planning/v6.6/remediation-wizard/01-feature-spec.md §4 + 02-deep-spec.md §1-4

const crypto = require('crypto');
const fs = require('fs');
const zlib = require('zlib');
const log = require('../utils/logger')('remediate');
const { getDb } = require('../db');
const dockerService = require('../services/docker');
const catalog = require('./remediation-catalog');
const composeDiff = require('./compose-diff');
const dockerRunner = require('./docker-runner');

// ─── Planning ──────────────────────────────────────────

/**
 * Build a remediation plan for one or more containers.
 * @param {object} args
 * @param {Array<{id: string, hostId: number}>} args.containers
 * @param {string[]} args.findings - catalog codes to apply
 * @returns {Promise<object>} plan
 */
async function plan({ containers, findings }) {
  if (!Array.isArray(containers) || containers.length === 0) {
    throw new Error('containers array required');
  }
  if (!Array.isArray(findings) || findings.length === 0) {
    throw new Error('findings array required');
  }

  const steps = [];
  const warnings = [];
  let totalDowntimeMs = 0;
  let gitBacked = false;

  for (const ref of containers) {
    const docker = dockerService.getDocker(ref.hostId || 0);
    let inspect;
    try {
      inspect = await docker.getContainer(ref.id).inspect();
    } catch (e) {
      warnings.push(`Cannot inspect ${ref.id}: ${e.message}`);
      continue;
    }

    // Augment with live stats for memory heuristics
    try {
      const statsStream = await docker.getContainer(ref.id).stats({ stream: false });
      inspect._stats = statsStream;
    } catch { /* stats optional */ }

    const labels = inspect.Config?.Labels || {};
    const composeFile = labels['com.docker.compose.project.config_files']?.split(',')[0] || null;
    const serviceName = labels['com.docker.compose.service'] || null;
    const stackName = labels['com.docker.compose.project'] || null;

    // If multiple compose files, warn
    if (labels['com.docker.compose.project.config_files']?.includes(',')) {
      warnings.push(`Container ${inspect.Name} is part of a multi-file compose project; only the first file is supported in v6.6.`);
    }

    const composeFileExists = composeFile ? fs.existsSync(composeFile) : false;
    let composeServiceBlock = null;
    let parsedComposeBefore = null;
    if (composeFileExists && serviceName) {
      try {
        const YAML = require('yaml');
        parsedComposeBefore = fs.readFileSync(composeFile, 'utf8');
        const doc = YAML.parseDocument(parsedComposeBefore);
        composeServiceBlock = doc.getIn(['services', serviceName])?.toJSON?.() || null;
      } catch (e) {
        warnings.push(`Cannot parse compose file ${composeFile}: ${e.message}`);
      }
    }

    // Collect patches + CLI commands for this container
    const compiledPatch = {};
    const cliCommands = [];
    let liveUpdateCmd = null;
    const appliedFindings = [];
    let requiresRecreation = false;
    let estimatedDowntimeMs = 0;

    for (const code of findings) {
      const entry = catalog.get(code);
      if (!entry) continue;
      if (!entry.applies(inspect)) continue;  // not applicable to this container

      const result = entry.plan(inspect, composeServiceBlock);
      appliedFindings.push({
        code,
        title: entry.title,
        severity: entry.severity,
        liveUpdatable: entry.liveUpdatable,
        requiresRecreation: entry.requiresRecreation,
        riskLevel: entry.riskLevel,
        riskNotes: entry.riskNotes,
        notes: result.notes,
      });

      // Merge compose patches
      Object.assign(compiledPatch, mergePatch(compiledPatch, result.composePatch));

      // CLI commands (live updates collated separately)
      if (result.cliCommands) cliCommands.push(...result.cliCommands);
      if (result.liveUpdate) {
        if (liveUpdateCmd) {
          // Merge multiple docker update flags into one command
          liveUpdateCmd = mergeDockerUpdateFlags(liveUpdateCmd, result.liveUpdate);
        } else {
          liveUpdateCmd = result.liveUpdate;
        }
      }

      if (entry.requiresRecreation) {
        requiresRecreation = true;
        estimatedDowntimeMs = Math.max(estimatedDowntimeMs, 3000);
      }
    }

    totalDowntimeMs += estimatedDowntimeMs;

    // Generate diff if we have a compose file + non-empty patch
    let diff = null;
    if (composeFileExists && serviceName && Object.keys(compiledPatch).length > 0) {
      try {
        const diffResult = composeDiff.diffComposeFile(composeFile, { [serviceName]: compiledPatch });
        diff = diffResult.unified;
      } catch (e) {
        warnings.push(`Cannot diff compose for ${inspect.Name}: ${e.message}`);
      }
    }

    // Git-backed detection (labels may include git info; fallback via stacks table)
    const db = getDb();
    if (stackName) {
      try {
        const stackRow = db.prepare('SELECT git_repo_id FROM git_stacks WHERE stack_name = ? LIMIT 1').get(stackName);
        if (stackRow?.git_repo_id) gitBacked = true;
      } catch { /* table may not exist pre-v6 */ }
    }

    steps.push({
      containerId: inspect.Id,
      containerName: inspect.Name?.replace(/^\//, ''),
      hostId: ref.hostId || 0,
      stackName,
      serviceName,
      composeFile,
      composeFileExists,
      findings: appliedFindings,
      composePatch: compiledPatch,
      cliCommands,
      liveUpdate: liveUpdateCmd,
      diff,
      requiresRecreation,
      estimatedDowntimeMs,
    });
  }

  const planObj = {
    planId: null,  // set by caller if persisting
    steps,
    totalDowntimeMs,
    gitBacked,
    warnings,
    generatedAt: new Date().toISOString(),
  };

  // Assign a stable SHA-256 as planId
  planObj.planId = crypto.createHash('sha256')
    .update(JSON.stringify({ steps: planObj.steps, totalDowntimeMs }))
    .digest('hex').substring(0, 16);

  return planObj;
}

// ─── Apply ─────────────────────────────────────────────

/**
 * Create a remediation_jobs row + kick off async apply.
 * @param {object} args { plan, mode, userId, hostId, scope }
 * @returns {{jobId: number}}
 */
function createJob({ plan, mode, userId, hostId, scope }) {
  const db = getDb();

  // Concurrency: refuse if another job is running for the same scope
  const existing = db.prepare(`
    SELECT id FROM remediation_jobs
    WHERE status IN ('pending', 'running')
      AND scope_type = ?
      AND scope_id = ?
      AND host_id = ?
    LIMIT 1
  `).get(scope.type, scope.id, hostId || 0);
  if (existing) {
    const err = new Error(`A remediation is already in progress for ${scope.type}:${scope.id} (job ${existing.id})`);
    err.code = 'CONCURRENT_JOB';
    err.existingJobId = existing.id;
    throw err;
  }

  const result = db.prepare(`
    INSERT INTO remediation_jobs
      (mode, scope_type, scope_id, host_id, plan_json, status, created_by)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `).run(mode, scope.type, String(scope.id), hostId || 0, JSON.stringify(plan), userId || null);

  return { jobId: result.lastInsertRowid };
}

/**
 * Execute a remediation job asynchronously. Returns immediately with a runner promise.
 * Caller should not await — the runner updates the DB as it progresses.
 *
 * NOTE: Session 1 scope — this is the SKELETON. Full recreate logic + health checks +
 * rollback land in Session 2 alongside docker-runner.js.
 */
async function runJob(jobId) {
  const db = getDb();
  const job = db.prepare('SELECT * FROM remediation_jobs WHERE id = ?').get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.status !== 'pending') throw new Error(`Job ${jobId} is ${job.status}, not pending`);

  const plan = JSON.parse(job.plan_json);

  db.prepare(`UPDATE remediation_jobs SET status='running', started_at=datetime('now') WHERE id=?`).run(jobId);
  log.info('Remediation job started', { jobId, mode: job.mode });

  try {
    if (job.mode === 'apply-local') {
      await _applyLocal(jobId, plan);
    } else if (job.mode === 'pr') {
      await _openPr(jobId, plan);
    } else if (job.mode === 'artifact') {
      // Artifact mode doesn't actually apply — just marks success so UI can download
      db.prepare(`UPDATE remediation_jobs SET status='success', completed_at=datetime('now'), output='Artifact ready for download' WHERE id=?`).run(jobId);
    } else {
      throw new Error(`Unknown mode: ${job.mode}`);
    }
  } catch (e) {
    log.error('Remediation job failed', { jobId, error: e.message });
    db.prepare(`
      UPDATE remediation_jobs
      SET status='failed', error_class=?, output=?, completed_at=datetime('now')
      WHERE id=?
    `).run(_classifyError(e), (db.prepare('SELECT output FROM remediation_jobs WHERE id=?').get(jobId).output || '') + '\n[ERROR] ' + e.message, jobId);
  }
}

async function _applyLocal(jobId, plan) {
  const db = getDb();
  const output = [];
  const appendLog = (line) => {
    output.push(line);
    db.prepare(`UPDATE remediation_jobs SET output=?, current_step=? WHERE id=?`).run(output.join('\n'), line, jobId);
  };

  // Snapshot pre-apply state for rollback
  const snapshots = {};
  for (const step of plan.steps) {
    try {
      const docker = dockerService.getDocker(step.hostId || 0);
      const inspect = await docker.getContainer(step.containerId).inspect();
      snapshots[step.containerId] = {
        inspect,
        composeFileContent: step.composeFileExists && step.composeFile
          ? fs.readFileSync(step.composeFile, 'utf8')
          : null,
      };
    } catch (e) {
      appendLog(`[warn] Cannot snapshot ${step.containerId}: ${e.message}`);
    }
  }
  const snapshotBlob = zlib.gzipSync(JSON.stringify(snapshots)).toString('base64');
  db.prepare(`UPDATE remediation_jobs SET pre_apply_snapshot=? WHERE id=?`).run(snapshotBlob, jobId);
  appendLog(`✓ Snapshotted ${Object.keys(snapshots).length} container(s) for rollback`);

  // Phase 1: live updates (zero downtime)
  for (const step of plan.steps) {
    if (!step.liveUpdate) continue;
    appendLog(`⏳ Live update: ${step.containerName} → ${step.liveUpdate}`);
    try {
      const { execFileSync } = require('child_process');
      const [cmd, ...args] = step.liveUpdate.split(' ');
      execFileSync(cmd, args, { encoding: 'utf8' });
      appendLog(`✓ ${step.containerName} updated`);
    } catch (e) {
      throw new Error(`Live update failed for ${step.containerName}: ${e.message}`);
    }
  }

  // Phase 2: group compose rewrites by file, then recreate in topo order
  const stepsByFile = {};
  for (const step of plan.steps) {
    if (!step.requiresRecreation || !step.composeFileExists) continue;
    if (!stepsByFile[step.composeFile]) stepsByFile[step.composeFile] = [];
    stepsByFile[step.composeFile].push(step);
  }

  for (const [composeFile, steps] of Object.entries(stepsByFile)) {
    try {
      // Build patches object per service
      const patchesByService = {};
      for (const step of steps) {
        patchesByService[step.serviceName] = step.composePatch;
      }

      appendLog(`⏳ Writing updated compose file: ${composeFile}`);
      const diffResult = composeDiff.diffComposeFile(composeFile, patchesByService);
      fs.writeFileSync(composeFile + '.tmp', diffResult.after, 'utf8');
      fs.renameSync(composeFile + '.tmp', composeFile);
      appendLog(`✓ Compose file updated (${steps.length} service(s))`);

      // Recreate in topo order with health check
      const YAML = require('yaml');
      const composeDoc = YAML.parse(diffResult.after);
      const services = steps.map(s => s.serviceName);
      const hostId = steps[0].hostId || 0;
      const docker = dockerService.getDocker(hostId);

      await dockerRunner.recreateInOrder({
        composeFile, composeDoc, services, docker, hostId, onLog: appendLog,
      });

    } catch (e) {
      appendLog(`✗ Recreate failed: ${e.message}`);
      // Auto-rollback
      appendLog(`⏳ Auto-rolling back...`);
      try {
        await dockerRunner.rollback({
          snapshots,
          onLog: appendLog,
          hostId: plan.steps[0]?.hostId || 0,
        });
        db.prepare(`UPDATE remediation_jobs SET status='rolled_back', error_class=?, completed_at=datetime('now') WHERE id=?`)
          .run(_classifyError(e), jobId);
        appendLog(`✓ Rollback complete`);
      } catch (rollbackErr) {
        db.prepare(`UPDATE remediation_jobs SET status='failed', error_class='rollback', output=?, completed_at=datetime('now') WHERE id=?`)
          .run(output.join('\n') + '\n[ROLLBACK FAILED] ' + rollbackErr.message, jobId);
        appendLog(`✗ ROLLBACK FAILED — manual intervention required`);
      }
      throw e;
    }
  }

  db.prepare(`
    UPDATE remediation_jobs
    SET status='success', completed_at=datetime('now'),
        rollback_deadline=datetime('now', '+60 seconds')
    WHERE id=?
  `).run(jobId);
  appendLog(`✓ Job complete. Rollback available for 60 seconds.`);
  log.info('Remediation job succeeded', { jobId });
}

// ─── Manual rollback (called from route) ───────────────

async function executeRollback(jobId) {
  const db = getDb();
  const job = db.prepare('SELECT * FROM remediation_jobs WHERE id = ?').get(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);
  if (job.status !== 'success') throw new Error(`Cannot rollback job in status '${job.status}'`);
  if (!job.rollback_deadline || new Date(job.rollback_deadline) < new Date()) {
    throw new Error('Rollback window expired');
  }
  if (!job.pre_apply_snapshot) throw new Error('No snapshot available for rollback');

  const snapshots = JSON.parse(zlib.gunzipSync(Buffer.from(job.pre_apply_snapshot, 'base64')).toString('utf8'));
  const output = [job.output || ''];
  const appendLog = (line) => {
    output.push(line);
    db.prepare(`UPDATE remediation_jobs SET output=?, current_step=? WHERE id=?`).run(output.join('\n'), line, jobId);
  };

  appendLog(`⏳ Manual rollback initiated for job ${jobId}`);

  try {
    await dockerRunner.rollback({
      snapshots,
      onLog: appendLog,
      hostId: 0,  // TODO multi-host
    });
    db.prepare(`UPDATE remediation_jobs SET status='rolled_back', completed_at=datetime('now') WHERE id=?`).run(jobId);
    appendLog(`✓ Rollback complete`);
    log.info('Manual rollback succeeded', { jobId });
    return { ok: true };
  } catch (e) {
    db.prepare(`UPDATE remediation_jobs SET status='failed', error_class='rollback' WHERE id=?`).run(jobId);
    appendLog(`✗ Rollback failed: ${e.message}`);
    throw e;
  }
}

async function _openPr(jobId, plan) {
  const db = getDb();
  const path = require('path');
  const os = require('os');
  const simpleGit = require('simple-git');

  const output = [];
  const appendLog = (line) => {
    output.push(line);
    db.prepare(`UPDATE remediation_jobs SET output=?, current_step=? WHERE id=?`).run(output.join('\n'), line, jobId);
  };

  // Group steps by stack; for v1 we only support single-stack PRs
  const stackNames = new Set(plan.steps.map(s => s.stackName).filter(Boolean));
  if (stackNames.size !== 1) {
    throw new Error(`Git-PR mode requires exactly one stack; got ${stackNames.size}`);
  }
  const stackName = [...stackNames][0];

  // Resolve repo info from git_stacks table
  const stackRow = db.prepare('SELECT repo_url, branch, compose_path, credential_id FROM git_stacks WHERE stack_name = ?').get(stackName);
  if (!stackRow) throw new Error(`Stack '${stackName}' is not git-managed`);

  appendLog(`⏳ Git-PR mode: stack=${stackName}, repo=${stackRow.repo_url}, base-branch=${stackRow.branch}`);

  // Workspace for the PR branch
  const workspace = path.join(os.tmpdir(), `dd-remediate-pr-${jobId}-${Date.now()}`);
  const git = simpleGit();

  try {
    // Clone with credentials if needed (delegate to existing git service for url-with-auth)
    // Simple approach: use simpleGit.clone — for credential support, the git service has _buildAuthUrl
    let cloneUrl = stackRow.repo_url;
    if (stackRow.credential_id) {
      const gitService = require('./git');
      try {
        cloneUrl = gitService._buildAuthUrl
          ? gitService._buildAuthUrl(stackRow.repo_url, stackRow.credential_id)
          : stackRow.repo_url;
      } catch { /* fall back to no auth */ }
    }

    appendLog(`⏳ Cloning ${stackRow.repo_url} (branch ${stackRow.branch})...`);
    await git.clone(cloneUrl, workspace, ['--depth', '50', '--branch', stackRow.branch]);
    appendLog(`✓ Cloned to ${workspace}`);

    // Create a new branch
    const branchName = `docker-dash/remediate-${plan.planId}`;
    const repoGit = simpleGit(workspace);
    await repoGit.checkoutLocalBranch(branchName);
    appendLog(`✓ Created branch ${branchName}`);

    // Apply compose patches — one patch per service, merged into the single compose file
    const patchesByService = {};
    for (const step of plan.steps) {
      if (step.serviceName && step.composePatch && Object.keys(step.composePatch).length > 0) {
        patchesByService[step.serviceName] = step.composePatch;
      }
    }
    if (Object.keys(patchesByService).length === 0) {
      throw new Error('No compose patches to apply');
    }

    const composeFilePath = path.join(workspace, stackRow.compose_path || 'docker-compose.yml');
    if (!fs.existsSync(composeFilePath)) {
      throw new Error(`Compose file not found in repo at ${stackRow.compose_path}`);
    }
    appendLog(`⏳ Applying patches to ${stackRow.compose_path}...`);
    const diffResult = composeDiff.diffComposeFile(composeFilePath, patchesByService);
    fs.writeFileSync(composeFilePath, diffResult.after, 'utf8');
    appendLog(`✓ Patches applied`);

    // Commit
    const findingCodes = [...new Set(plan.steps.flatMap(s => s.findings.map(f => f.code)))];
    const commitMsg = `remediate: fix ${findingCodes.join(', ')} on stack ${stackName}\n\nGenerated by Docker Dash Remediation Wizard.\nPlan ID: ${plan.planId}\nAffected services: ${Object.keys(patchesByService).join(', ')}`;
    await repoGit.add([stackRow.compose_path]);
    await repoGit.addConfig('user.email', 'bot@docker-dash.local');
    await repoGit.addConfig('user.name', 'Docker Dash');
    await repoGit.commit(commitMsg);
    appendLog(`✓ Committed`);

    // Push
    appendLog(`⏳ Pushing branch...`);
    await repoGit.push('origin', branchName, ['--set-upstream']);
    appendLog(`✓ Pushed branch ${branchName}`);

    // Construct PR URL (best-effort: GitHub/GitLab/Gitea conventions)
    let prUrl = null;
    const repo = stackRow.repo_url.replace(/\.git$/, '');
    if (repo.includes('github.com')) {
      prUrl = `${repo}/compare/${stackRow.branch}...${encodeURIComponent(branchName)}?expand=1`;
    } else if (repo.includes('gitlab')) {
      prUrl = `${repo}/-/merge_requests/new?merge_request[source_branch]=${encodeURIComponent(branchName)}`;
    } else {
      prUrl = `${repo} (branch ${branchName}) — open PR manually`;
    }

    appendLog(`✓ PR URL: ${prUrl}`);

    db.prepare(`
      UPDATE remediation_jobs
      SET status='success', git_branch=?, git_pr_url=?, completed_at=datetime('now')
      WHERE id=?
    `).run(branchName, prUrl, jobId);

    log.info('Git-PR remediation pushed', { jobId, branchName, prUrl });
  } finally {
    // Cleanup workspace
    try { fs.rmSync(workspace, { recursive: true, force: true }); } catch {}
  }
}

function _classifyError(err) {
  const msg = (err.message || '').toLowerCase();
  if (msg.includes('docker') && msg.includes('not found')) return 'docker';
  if (msg.includes('compose')) return 'compose';
  if (msg.includes('git')) return 'git';
  if (msg.includes('timeout')) return 'timeout';
  if (msg.includes('health')) return 'health';
  return 'other';
}

// ─── Helpers ───────────────────────────────────────────

/**
 * Merge two patch objects. Used when multiple findings on the same container
 * produce overlapping patches (e.g., both no-new-privileges and dangerous-caps
 * touch `security_opt` / `cap_add`).
 */
function mergePatch(a, b) {
  if (!a) return b;
  if (!b) return a;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    if (v === null) {
      out[k] = null;
    } else if (v && typeof v === 'object' && v.$add && out[k]?.$add) {
      out[k] = { $add: [...new Set([...out[k].$add, ...v.$add])] };
    } else if (v && typeof v === 'object' && v.$remove && out[k]?.$remove) {
      out[k] = { $remove: [...new Set([...out[k].$remove, ...v.$remove])] };
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Merge two `docker update ...` commands into one.
 * Example: "docker update --memory 512m abc" + "docker update --cpus 1 abc"
 *       → "docker update --memory 512m --cpus 1 abc"
 */
function mergeDockerUpdateFlags(cmdA, cmdB) {
  const parseFlags = (cmd) => {
    const parts = cmd.split(/\s+/);
    const containerId = parts[parts.length - 1];
    const flags = parts.slice(2, -1);  // skip "docker", "update", last (container ID)
    return { flags, containerId };
  };
  const a = parseFlags(cmdA);
  const b = parseFlags(cmdB);
  if (a.containerId !== b.containerId) return cmdA;  // different containers, can't merge
  return `docker update ${a.flags.join(' ')} ${b.flags.join(' ')} ${a.containerId}`;
}

module.exports = {
  plan,
  createJob,
  runJob,
  executeRollback,
  _classifyError,
  mergePatch,
  mergeDockerUpdateFlags,
};
