'use strict';

// v8.2.x further-split: extracted from src/routes/system.js.
// 7 routes covering /schedules CRUD + history + preview + run-now.
// Mounted at `/schedules`. External URL `/api/system/schedules` unchanged.

const { Router } = require('express');
const fs = require('fs');
const dockerService = require('../services/docker');
const auditService = require('../services/audit');
const { requireAuth, requireRole, writeable } = require('../middleware/auth');
const { getClientIp } = require('../utils/helpers');
const { getDb } = require('../db');
const { extractHostId } = require('../middleware/hostId');

const router = Router();
router.use(extractHostId);

// Schedule storage — DB-backed with JSON fallback (extracted from system.js)
const schedulesFile = '/data/schedules.json';

function loadSchedules() {
  try {
    if (fs.existsSync(schedulesFile)) return JSON.parse(fs.readFileSync(schedulesFile, 'utf8'));
  } catch { /* ignore */ }
  return [];
}

function saveSchedules(schedules) {
  fs.writeFileSync(schedulesFile, JSON.stringify(schedules, null, 2));
}

function getSchedulesFromDb() {
  try {
    const db = getDb();
    return db.prepare('SELECT * FROM scheduled_actions ORDER BY created_at DESC').all();
  } catch {
    return null;
  }
}

function cronMatchesDate(parts, date) {
  const checks = [
    { val: date.getMinutes(), part: parts[0] },
    { val: date.getHours(), part: parts[1] },
    { val: date.getDate(), part: parts[2] },
    { val: date.getMonth() + 1, part: parts[3] },
    { val: date.getDay(), part: parts[4] },
  ];
  return checks.every(({ val, part }) => {
    if (part === '*') return true;
    if (part.includes('/')) {
      const step = parseInt(part.split('/')[1]);
      return step > 0 && val % step === 0;
    }
    if (part.includes(',')) return part.split(',').map(Number).includes(val);
    if (part.includes('-')) {
      const [min, max] = part.split('-').map(Number);
      return val >= min && val <= max;
    }
    return parseInt(part) === val;
  });
}

router.get('/', requireAuth, (req, res) => {
  const dbSchedules = getSchedulesFromDb();
  if (dbSchedules !== null) {
    return res.json(dbSchedules.map(s => ({
      id: s.id, containerId: s.container_id, containerName: s.container_name,
      hostId: s.host_id, action: s.action, cron: s.cron, enabled: !!s.enabled,
      description: s.description, createdBy: s.created_by, createdAt: s.created_at,
      lastRunAt: s.last_run_at, lastRunStatus: s.last_run_status, runCount: s.run_count,
    })));
  }
  res.json(loadSchedules());
});

router.post('/', requireAuth, requireRole('admin', 'operator'), writeable, (req, res) => {
  const { containerId, containerName, action, cron, enabled, description } = req.body;
  if (!containerId || !action || !cron) return res.status(400).json({ error: 'containerId, action, cron required' });

  const id = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);

  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO scheduled_actions (id, container_id, container_name, host_id, action, cron, enabled, description, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, containerId, containerName || '', req.hostId || 0, action, cron, enabled !== false ? 1 : 0, description || '', req.user.username);

    const entry = db.prepare('SELECT * FROM scheduled_actions WHERE id = ?').get(id);
    auditService.log({
      userId: req.user.id, username: req.user.username,
      action: 'schedule_create', targetType: 'schedule', targetId: id,
      details: { containerId, action, cron }, ip: getClientIp(req),
    });
    return res.status(201).json({
      id: entry.id, containerId: entry.container_id, containerName: entry.container_name,
      action: entry.action, cron: entry.cron, enabled: !!entry.enabled,
      createdAt: entry.created_at,
    });
  } catch {
    // Fallback to JSON
    const schedules = loadSchedules();
    const entry = { id, containerId, containerName: containerName || '', action, cron, enabled: enabled !== false, createdAt: new Date().toISOString() };
    schedules.push(entry);
    saveSchedules(schedules);
    auditService.log({
      userId: req.user.id, username: req.user.username,
      action: 'schedule_create', targetType: 'schedule', targetId: id,
      details: entry, ip: getClientIp(req),
    });
    res.status(201).json(entry);
  }
});

// Cron preview — must be before /:id routes
router.get('/preview', requireAuth, (req, res) => {
  const cronExpr = req.query.cron;
  if (!cronExpr) return res.status(400).json({ error: 'cron required' });

  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length < 5) return res.status(400).json({ error: 'Invalid cron expression' });

  const runs = [];
  const now = new Date();
  const check = new Date(now);
  check.setSeconds(0, 0);

  for (let i = 0; i < 60 * 24 * 7 && runs.length < 5; i++) {
    check.setMinutes(check.getMinutes() + 1);
    if (cronMatchesDate(parts, check)) {
      runs.push(check.toISOString());
    }
  }
  res.json({ cron: cronExpr, nextRuns: runs });
});

router.delete('/:id', requireAuth, requireRole('admin'), writeable, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT id FROM scheduled_actions WHERE id = ?').get(req.params.id);
    if (existing) {
      db.prepare('DELETE FROM schedule_history WHERE schedule_id = ?').run(req.params.id);
      db.prepare('DELETE FROM scheduled_actions WHERE id = ?').run(req.params.id);
      auditService.log({
        userId: req.user.id, username: req.user.username,
        action: 'schedule_delete', targetType: 'schedule', targetId: req.params.id,
        ip: getClientIp(req),
      });
      return res.json({ ok: true });
    }
  } catch { /* fallback */ }

  let schedules = loadSchedules();
  const idx = schedules.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Schedule not found' });
  schedules.splice(idx, 1);
  saveSchedules(schedules);
  auditService.log({
    userId: req.user.id, username: req.user.username,
    action: 'schedule_delete', targetType: 'schedule', targetId: req.params.id,
    ip: getClientIp(req),
  });
  res.json({ ok: true });
});

router.put('/:id', requireAuth, requireRole('admin', 'operator'), writeable, (req, res) => {
  const { enabled, cron, action, description } = req.body;

  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM scheduled_actions WHERE id = ?').get(req.params.id);
    if (existing) {
      if (enabled !== undefined) db.prepare('UPDATE scheduled_actions SET enabled = ?, updated_at = datetime(\'now\') WHERE id = ?').run(enabled ? 1 : 0, req.params.id);
      if (cron) db.prepare('UPDATE scheduled_actions SET cron = ?, updated_at = datetime(\'now\') WHERE id = ?').run(cron, req.params.id);
      if (action) db.prepare('UPDATE scheduled_actions SET action = ?, updated_at = datetime(\'now\') WHERE id = ?').run(action, req.params.id);
      if (description !== undefined) db.prepare('UPDATE scheduled_actions SET description = ?, updated_at = datetime(\'now\') WHERE id = ?').run(description, req.params.id);
      const updated = db.prepare('SELECT * FROM scheduled_actions WHERE id = ?').get(req.params.id);
      return res.json({
        id: updated.id, containerId: updated.container_id, containerName: updated.container_name,
        action: updated.action, cron: updated.cron, enabled: !!updated.enabled,
      });
    }
  } catch { /* fallback */ }

  const schedules = loadSchedules();
  const idx = schedules.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Schedule not found' });
  if (enabled !== undefined) schedules[idx].enabled = enabled;
  if (cron) schedules[idx].cron = cron;
  if (action) schedules[idx].action = action;
  saveSchedules(schedules);
  res.json(schedules[idx]);
});

// Schedule history
router.get('/:id/history', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const history = db.prepare(`
      SELECT * FROM schedule_history WHERE schedule_id = ?
      ORDER BY executed_at DESC LIMIT 50
    `).all(req.params.id);
    res.json(history);
  } catch {
    res.json([]);
  }
});

// Run schedule now
router.post('/:id/run-now', requireAuth, requireRole('admin', 'operator'), writeable, async (req, res) => {
  try {
    const db = getDb();
    const schedule = db.prepare('SELECT * FROM scheduled_actions WHERE id = ?').get(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Schedule not found' });

    const start = Date.now();
    try {
      await dockerService.containerAction(schedule.container_id, schedule.action, schedule.host_id || 0);
      const duration = Date.now() - start;
      db.prepare(`INSERT INTO schedule_history (schedule_id, container_id, action, status, duration_ms) VALUES (?, ?, ?, 'success', ?)`).run(schedule.id, schedule.container_id, schedule.action, duration);
      db.prepare(`UPDATE scheduled_actions SET last_run_at = datetime('now'), last_run_status = 'success', run_count = run_count + 1 WHERE id = ?`).run(schedule.id);
      res.json({ ok: true, duration });
    } catch (err) {
      const duration = Date.now() - start;
      db.prepare(`INSERT INTO schedule_history (schedule_id, container_id, action, status, error_message, duration_ms) VALUES (?, ?, ?, 'error', ?, ?)`).run(schedule.id, schedule.container_id, schedule.action, err.message, duration);
      db.prepare(`UPDATE scheduled_actions SET last_run_at = datetime('now'), last_run_status = 'error', last_run_error = ? WHERE id = ?`).run(err.message, schedule.id);
      res.status(500).json({ error: 'Internal server error' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
