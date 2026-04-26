'use strict';

// Audit NL Search feature — v8.0.0
//
// Translates natural-language queries ("who deleted prod-redis last
// Tuesday?") into a structured filter that we then run through the
// existing audit query path. NL → JSON-with-fixed-schema, NEVER NL → SQL.
//
// The schema enum for `action` is the canonical 161-entry list extracted
// from `auditService.log()` call sites (see plans/spikes-ai-features.md S5).
// LLMs cannot invent action values — schema validation drops them.
//
// D5 decision: server-side limit cap of 200, regardless of LLM-requested
// limit. Prevents accidental massive scans.

const aiService = require('../index');
const { auditActionsList } = require('./audit-actions-list');

const SERVER_SIDE_MAX_LIMIT = 200;

const AUDIT_FILTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    actor: { type: 'string', maxLength: 64 },
    action: { type: 'string', enum: auditActionsList },
    resource: { type: 'string', maxLength: 128 },
    host: { type: 'string', maxLength: 64 },
    since: { type: 'string', format: 'date-time' },
    until: { type: 'string', format: 'date-time' },
    limit: { type: 'integer', minimum: 1, maximum: 1000 },
  },
  required: [],
};

const SYSTEM_PROMPT = `You are a query translator for an audit log search system.

Your task: convert the user's natural-language audit query into a structured filter object.

Rules:
- Output ONLY fields you are confident about. Omit unknown fields rather than guessing.
- "since" and "until" must be ISO 8601 date-time strings (e.g. "2026-04-20T00:00:00Z"). Today's date is provided in the user message — compute relative dates from that.
- "action" must be one of the enum values in the schema. If the user describes an action that doesn't match any enum value, OMIT the action field — don't guess.
- "limit" defaults to 100. Cap at 1000 (the schema enforces this).
- For ambiguous time references ("recently", "lately"), default to the last 24 hours.
- For empty or off-topic queries (greetings, gibberish, requests outside audit search), return an empty filter object {}.
- NEVER attempt to be helpful by inventing data. Empty filter > wrong filter.`;

/**
 * Run the NL → filter translation. Caller passes in the user query and
 * receives the parsed filter (already schema-validated by aiService).
 *
 * @param {object} req
 * @param {string} req.query     — natural language query
 * @param {object} [req.audit]   — { userId, username, ip } for audit log
 * @returns {Promise<{filter: object, raw: object}>}
 */
async function translateQuery(req) {
  const { query, audit = {} } = req;
  if (typeof query !== 'string' || !query.trim()) {
    return { filter: {}, raw: { skipped: 'empty query' } };
  }

  // Provide today's date in the user-side prompt so relative dates resolve.
  const today = new Date().toISOString();
  const userPrompt = `Today is ${today}.\n\nQuery: ${query}`;

  const result = await aiService.call('audit-nl-search', {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    schema: AUDIT_FILTER_SCHEMA,
    toolName: 'audit_filter',
    maxTokens: 256,
    timeoutMs: 15000,
  }, audit);

  // D5: cap server-side regardless of what the LLM returned
  const filter = { ...result.data };
  if (filter.limit && filter.limit > SERVER_SIDE_MAX_LIMIT) {
    filter.limit = SERVER_SIDE_MAX_LIMIT;
  }
  if (!filter.limit) {
    filter.limit = 100;  // sensible default
  }

  return {
    filter,
    raw: {
      provider: result.model,
      latencyMs: result.latencyMs,
      usage: result.usage,
      redactions: result.redactions,
      payloadHash: result.payloadHash,
    },
  };
}

module.exports = {
  translateQuery,
  SERVER_SIDE_MAX_LIMIT,
  AUDIT_FILTER_SCHEMA,
  // For tests
  _internals: { SYSTEM_PROMPT },
};
