'use strict';

// cluster — v6.17.0 (HA foundation)
//
// Central abstraction for HA-aware state. Every HA-eligible subsystem
// (rate limiter now; WS pub/sub + cron leader election in v7.0.0)
// imports this module.
//
// Standalone default (DD_MODE unset):
//   - Every method is a cheap no-op or falls through to in-process state.
//   - Zero runtime overhead. ioredis is never require()d.
//
// HA mode (DD_MODE=ha):
//   - Lazy-connects to Redis (REDIS_URL, default redis://localhost:6379)
//   - rateLimitTick → Redis INCR + PEXPIRE
//   - publish/subscribe / isLeader remain stubs in v6.17.0 (see deep-spec §8);
//     wired in v7.0.0-alpha.1 and v7.0.0-rc.1 respectively.
//
// See plans/deep-spec-ha-mode.md for architecture + rollout plan.

const log = require('../utils/logger')('cluster');
const crypto = require('crypto');

const MODE = process.env.DD_MODE || 'standalone';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const NODE_ID = MODE === 'ha' ? crypto.randomUUID() : 'standalone';

let _redis = null;
let _redisPromise = null;

function isHa() { return MODE === 'ha'; }
function nodeId() { return NODE_ID; }

/** Return the ioredis client in HA mode, or null in standalone.
 *  Lazy-connects on first call. Caches the connection for the process lifetime. */
async function redis() {
  if (!isHa()) return null;
  if (_redis) return _redis;
  if (_redisPromise) return _redisPromise;
  _redisPromise = (async () => {
    let Redis;
    try {
      Redis = require('ioredis');
    } catch {
      const msg = 'DD_MODE=ha but ioredis is not installed. Run `npm install ioredis` or unset DD_MODE.';
      log.error(msg);
      throw new Error(msg);
    }
    _redis = new Redis(REDIS_URL, {
      lazyConnect: false,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    _redis.on('connect', () => log.info('Redis connected', {
      // Redact credentials in the URL before logging
      url: REDIS_URL.replace(/:\/\/[^@]*@/, '://***@'),
      nodeId: NODE_ID,
    }));
    _redis.on('error', (e) => log.error('Redis error', { message: e.message }));
    return _redis;
  })();
  return _redisPromise;
}

/** Rate-limit decision for a given key + bucket.
 *  Returns { allowed, remaining, retryAfterSec }.
 *  Standalone: falls through to src/services/rate-limiter-memory.js (sliding window).
 *  HA: Redis INCR + PEXPIRE (fixed window — 2× looser at bucket boundary; documented trade-off). */
async function rateLimitTick(key, maxRequests, windowMs) {
  if (!isHa()) {
    const mem = require('./rate-limiter-memory');
    return mem.tick(key, maxRequests, windowMs);
  }
  const r = await redis();
  const bucket = `rl:${key}:${Math.floor(Date.now() / windowMs)}`;
  const count = await r.incr(bucket);
  if (count === 1) await r.pexpire(bucket, windowMs + 1000);
  if (count > maxRequests) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil(windowMs / 1000) };
  }
  return { allowed: true, remaining: maxRequests - count, retryAfterSec: null };
}

// ─── Phase 3 stubs (wired in v7.0.0-alpha.1) ─────────────────────

async function publish(_channel, _payload) {
  if (!isHa()) return;
  // TODO v7.0.0-alpha.1 — Redis pub/sub for cross-replica WS broadcasts.
}

function subscribe(_channel, _handler) {
  if (!isHa()) return;
  // TODO v7.0.0-alpha.1 — subscribe handler registration.
}

// ─── Phase 4 stubs (wired in v7.0.0-rc.1) ────────────────────────

async function isLeader() {
  // In standalone, this process IS the leader of its cluster of 1.
  // In HA v6.17.0, every node claims to be leader (cron jobs still
  // duplicate — users MUST NOT run multi-replica in HA mode yet; this
  // is documented loudly as a preview limitation).
  return true;
}

function onBecomeLeader(_fn) { /* TODO v7.0.0-rc.1 */ }
function onBecomeReader(_fn) { /* TODO v7.0.0-rc.1 */ }

async function shutdown() {
  if (_redis) {
    try { await _redis.quit(); } catch { /* ignore */ }
    _redis = null;
    _redisPromise = null;
  }
}

module.exports = {
  isHa, nodeId, redis,
  rateLimitTick,
  publish, subscribe,
  isLeader, onBecomeLeader, onBecomeReader,
  shutdown,
  // test-only: reset internal state
  _reset() { _redis = null; _redisPromise = null; },
};
