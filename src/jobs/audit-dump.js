'use strict';

// v8.2.0 — Monthly audit log dump. Exports the previous calendar month's
// audit rows as gzipped JSONL and uploads to pCloud and/or S3. Hash chain
// preserved row-for-row so the off-site dump is an immutable witness — if
// the live DB is ever tampered with, consecutive monthly dumps anchor truth.
// DOES NOT delete from DB; that's a separate retention concern.

const zlib = require('zlib');
const stream = require('stream');
const audit = require('../services/audit');
const config = require('../config');
const log = require('../utils/logger')('audit-dump');

function _previousMonth(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  const yearMonth = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}`;
  return { since: start.toISOString(), until: end.toISOString(), yearMonth };
}

function _explicitMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new Error(`Invalid month "${month}" — expected YYYY-MM`);
  }
  const [y, m] = month.split('-').map(n => parseInt(n, 10));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  if (start > new Date()) throw new Error('Cannot dump a future month');
  return { since: start.toISOString(), until: end.toISOString(), yearMonth: month };
}

async function _gzipJsonlForRange(since, until) {
  const chunks = [];
  const sink = new stream.Writable({
    write(chunk, _enc, cb) { chunks.push(chunk); cb(); }
  });
  const gz = zlib.createGzip({ level: 6 });
  gz.pipe(sink);

  const finished = new Promise((resolve, reject) => {
    sink.on('finish', resolve);
    gz.on('error', reject);
    sink.on('error', reject);
  });

  const { count } = audit.exportJsonl({ since, until, out: gz });
  gz.end();
  await finished;
  return { gzBuffer: Buffer.concat(chunks), rows: count };
}

async function run({ trigger = 'cron', month } = {}) {
  const startedAt = Date.now();
  const range = month ? _explicitMonth(month) : _previousMonth();
  const { since, until, yearMonth } = range;

  const { gzBuffer, rows } = await _gzipJsonlForRange(since, until);
  log.info('Audit dump prepared', { yearMonth, rows, gzBytes: gzBuffer.length });

  const errors = [];
  let enabledTargets = 0;
  if (config.pcloud?.enabled) {
    enabledTargets++;
    try {
      const pcloud = require('../services/pcloud-backup');
      await pcloud.uploadAuditDump(yearMonth, gzBuffer);
    } catch (err) { errors.push(`pcloud: ${err.message}`); }
  }
  if (config.s3?.enabled) {
    enabledTargets++;
    try {
      const s3 = require('../services/s3-backup');
      if (typeof s3.uploadObject === 'function') {
        await s3.uploadObject(`docker-dash/audit/${yearMonth}.jsonl.gz`, gzBuffer, 'application/gzip');
      }
    } catch (err) { errors.push(`s3: ${err.message}`); }
  }

  if (config.pcloud?.enabled) {
    try {
      const pcloud = require('../services/pcloud-backup');
      await pcloud.pruneAuditDumps();
    } catch (err) { log.warn('audit prune failed', err.message); }
  }

  const durationMs = Date.now() - startedAt;
  const status = errors.length === 0 ? 'success' : (errors.length >= enabledTargets ? 'error' : 'partial');

  if (config.pcloud?.enabled) {
    try {
      require('../services/pcloud-backup').noteAuditDumpResult({
        status,
        error: errors.length ? errors.join('; ') : null,
      });
    } catch (err) { log.warn('Failed to update last_audit_* status', err.message); }
  }

  require('../services/audit').log({
    userId: 0, username: 'system',
    action: status === 'error' ? 'backup_pcloud_failed' : 'backup_pcloud',
    targetType: 'system', targetId: 'audit-dump',
    details: JSON.stringify({ kind: 'audit', trigger, yearMonth, rows, gzBytes: gzBuffer.length, durationMs, errors }),
  });

  if (status === 'error') throw new Error(errors.join('; '));
  return { yearMonth, rows, gzBytes: gzBuffer.length, status, errors, durationMs };
}

module.exports = { run, _previousMonth, _explicitMonth };
