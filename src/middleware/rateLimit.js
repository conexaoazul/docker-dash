'use strict';

// Rate-limit middleware — delegates to src/services/cluster.js which routes
// to src/services/rate-limiter-memory.js (standalone) or Redis INCR (HA mode,
// v6.17.0+). See plans/deep-spec-ha-mode.md §4 for the split rationale.
//
// Fail-open on Redis errors: a rate-limiter failure in HA mode allows the
// request through with a log warning, prioritizing user-facing availability
// over strict quota enforcement. Standalone path cannot fail this way.

const { getClientIp } = require('../utils/helpers');
const cluster = require('../services/cluster');
const log = require('../utils/logger')('ratelimit');

function middleware(maxRequests, windowMs) {
  return async (req, res, next) => {
    const ip = getClientIp(req);
    const key = `${req.route?.path || req.path}:${ip}`;
    let result;
    try {
      result = await cluster.rateLimitTick(key, maxRequests, windowMs);
    } catch (err) {
      log.warn('Rate limiter failure, allowing request', { message: err.message });
      return next();
    }
    if (!result.allowed) {
      res.set('Retry-After', String(result.retryAfterSec));
      res.set('X-RateLimit-Remaining', '0');
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: result.retryAfterSec,
      });
    }
    res.set('X-RateLimit-Remaining', String(result.remaining));
    next();
  };
}

// Back-compat export — keep the old `rateLimiter.middleware(…)` + `rateLimit(…)` API
// callers use. Passing `rateLimiter` itself as the object that exposes `middleware`.
const rateLimiter = { middleware };

module.exports = {
  rateLimiter,
  rateLimit: middleware,
  middleware,
};
