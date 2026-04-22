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

// ─── Phase 3 — Redis pub/sub (v6.17.1) ────────────────────────────
//
// Single Redis channel `ddash:pubsub` carries all application-level pub/sub
// traffic. App-level channel routing happens in the subscriber callback.
// Envelope includes `nodeId` so publishers ignore their own echoes (avoids
// deliver-twice-locally loop).
//
// Why single Redis channel: app-level channels (ws:broadcast, etc.) are ~3-5
// total. Sub-channels would reduce filtering cost slightly but multiply
// connection state. For the volume Docker Dash handles (~10s msg/sec) a
// single subscribed channel + in-process dispatch is simpler and plenty fast.

const REDIS_PUBSUB_CHANNEL = 'ddash:pubsub';
let _subClient = null;
let _subClientPromise = null;
const _subscribers = new Map(); // appChannel → Set<handler>

async function _ensureSubscriber() {
  if (_subClient) return _subClient;
  if (_subClientPromise) return _subClientPromise;
  _subClientPromise = (async () => {
    let Redis;
    try { Redis = require('ioredis'); }
    catch { throw new Error('ioredis missing — install it or unset DD_MODE'); }
    const c = new Redis(REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 3 });
    c.on('error', (e) => log.error('Redis subscriber error', { message: e.message }));
    c.on('message', (_chan, raw) => {
      let env;
      try { env = JSON.parse(raw); } catch { return; }
      if (!env || env.nodeId === NODE_ID) return; // skip self-echo
      const handlers = _subscribers.get(env.appChannel);
      if (!handlers) return;
      for (const h of handlers) {
        try { h(env.payload); }
        catch (e) { log.warn('subscriber handler threw', { message: e.message }); }
      }
    });
    await c.subscribe(REDIS_PUBSUB_CHANNEL);
    _subClient = c;
    log.info('Redis subscriber connected', { channel: REDIS_PUBSUB_CHANNEL, nodeId: NODE_ID });
    return c;
  })();
  return _subClientPromise;
}

/** Publish to cross-replica. Best-effort (errors logged + swallowed —
 *  pub/sub is eventually-consistent, local delivery must not fail). */
async function publish(appChannel, payload) {
  if (!isHa()) return;
  try {
    const r = await redis();
    const envelope = JSON.stringify({ nodeId: NODE_ID, appChannel, payload });
    await r.publish(REDIS_PUBSUB_CHANNEL, envelope);
  } catch (err) {
    log.warn('publish failed (local delivery unaffected)', { appChannel, message: err.message });
  }
}

/** Subscribe to a cross-replica channel. Handler receives the `payload`
 *  object, already filtered to exclude messages from this node. */
function subscribe(appChannel, handler) {
  if (!isHa()) return;
  let set = _subscribers.get(appChannel);
  if (!set) { set = new Set(); _subscribers.set(appChannel, set); }
  set.add(handler);
  // Fire-and-forget — the subscriber client connects async; messages published
  // before it's ready are lost (acceptable for our use case: WS broadcasts
  // and cache invalidations are eventually consistent).
  _ensureSubscriber().catch((e) => log.error('subscriber connect failed', { message: e.message }));
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
  if (_subClient) {
    try { await _subClient.quit(); } catch { /* ignore */ }
    _subClient = null;
    _subClientPromise = null;
  }
  if (_redis) {
    try { await _redis.quit(); } catch { /* ignore */ }
    _redis = null;
    _redisPromise = null;
  }
  _subscribers.clear();
}

module.exports = {
  isHa, nodeId, redis,
  rateLimitTick,
  publish, subscribe,
  isLeader, onBecomeLeader, onBecomeReader,
  shutdown,
  // test-only: reset internal state
  _reset() {
    _redis = null;
    _redisPromise = null;
    _subClient = null;
    _subClientPromise = null;
    _subscribers.clear();
  },
};
