'use strict';

// OpenAI provider — v8.0.0
//
// Uses OpenAI's Responses API with structured outputs (response_format with
// json_schema). The schema is enforced server-side by OpenAI when the model
// supports it (gpt-4o, gpt-4o-mini, gpt-4-turbo and later).
//
// Docs: https://platform.openai.com/docs/guides/structured-outputs
//
// Recommended model: gpt-4o-mini ($0.15/$0.60 per Mtok). Cheap enough for
// frequent NL search; capable enough for our v8.0.0 use case.

const https = require('https');
const { AiProvider, AiProviderError } = require('./base');

class OpenAiProvider extends AiProvider {
  constructor(config) {
    super(config);
    if (!config.apiKey) throw new Error('OpenAiProvider requires apiKey');
    this.apiKey = config.apiKey;
    this.model = config.model || 'gpt-4o-mini';
    this.baseUrl = config.endpointUrl || 'https://api.openai.com';
  }

  async test() {
    const start = Date.now();
    try {
      // Cheapest possible test: list models. Verifies key is valid.
      const result = await this._request('GET', '/v1/models', null, 5000);
      const found = (result.data || []).some(m => m.id === this.model);
      return {
        ok: true,
        model: this.model,
        latencyMs: Date.now() - start,
        modelAvailable: found,
        warning: found ? null : `Model "${this.model}" not in account's available models — verify access.`,
      };
    } catch (err) {
      return { ok: false, error: err.message, latencyMs: Date.now() - start };
    }
  }

  async structured(req) {
    const start = Date.now();
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: req.systemPrompt },
        { role: 'user', content: req.userPrompt },
      ],
      max_tokens: req.maxTokens || 1024,
      // Structured outputs — JSON schema enforced by the API.
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: req.toolName || 'output',
          strict: true,
          schema: this._toStrictSchema(req.schema),
        },
      },
      temperature: 0,  // deterministic for structured output
    };

    let response;
    try {
      response = await this._request('POST', '/v1/chat/completions', body, req.timeoutMs || 15000);
    } catch (err) {
      throw new AiProviderError(`OpenAI request failed: ${err.message}`, {
        code: err.code || 'network',
        statusCode: err.statusCode,
        retriable: err.retriable === true,
      });
    }

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      throw new AiProviderError('OpenAI returned no content', { code: 'empty-response' });
    }
    let parsed;
    try { parsed = JSON.parse(content); }
    catch (err) {
      throw new AiProviderError(`OpenAI returned non-JSON despite structured-output request: ${err.message}`, {
        code: 'malformed-json',
      });
    }

    return {
      data: parsed,
      usage: {
        input: response.usage?.prompt_tokens || 0,
        output: response.usage?.completion_tokens || 0,
      },
      model: response.model || this.model,
      latencyMs: Date.now() - start,
    };
  }

  /**
   * OpenAI structured outputs require additionalProperties:false on every
   * object level. We add it defensively if the schema author forgot.
   */
  _toStrictSchema(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    const out = { ...schema };
    if (out.type === 'object' && out.additionalProperties === undefined) {
      out.additionalProperties = false;
    }
    if (out.properties) {
      out.properties = Object.fromEntries(
        Object.entries(out.properties).map(([k, v]) => [k, this._toStrictSchema(v)])
      );
    }
    return out;
  }

  _request(method, path, body, timeoutMs) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const payload = body ? JSON.stringify(body) : null;
      const req = https.request(url, {
        method,
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
        timeout: timeoutMs,
      }, (res) => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode >= 400) {
            const err = new Error(`HTTP ${res.statusCode}: ${text.substring(0, 200)}`);
            err.code = `http-${res.statusCode}`;
            err.statusCode = res.statusCode;
            err.retriable = res.statusCode >= 500 || res.statusCode === 429;
            return reject(err);
          }
          try { resolve(JSON.parse(text)); }
          catch { reject(new Error('OpenAI returned non-JSON top-level response')); }
        });
      });
      req.on('error', (err) => {
        const e = new Error(err.message);
        e.code = err.code;
        reject(e);
      });
      req.on('timeout', () => {
        req.destroy();
        const err = new Error('OpenAI request timed out');
        err.code = 'timeout';
        err.retriable = true;
        reject(err);
      });
      if (payload) req.write(payload);
      req.end();
    });
  }
}

module.exports = OpenAiProvider;
