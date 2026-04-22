'use strict';

// Wraps an async route handler so thrown errors / rejected promises
// forward to the central error middleware below. Eliminates the 24x
// duplicate try/catch + res.status(500).json({ error: err.message })
// boilerplate we accumulated across src/routes/ pre-Express-5.
//
// Usage:
//   router.get('/x', requireAuth, asyncHandler(async (req, res) => {
//     const data = await something();
//     res.json(data);
//   }));

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

module.exports = asyncHandler;
