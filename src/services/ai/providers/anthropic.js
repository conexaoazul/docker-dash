'use strict';

// Anthropic provider — v8.0.0
//
// Uses Claude's Messages API with tool_use to enforce structured output.
// We declare a single "tool" matching the caller's schema and force the
// model to call it via tool_choice. Output comes back as the tool's input
// argument — already parsed and conforming.
//
// Docs: https://docs.anthropic.com/en/api/messages
// Tool use: https://docs.anthropic.com/en/docs/build-with-claude/tool-use
//
// Recommended model: claude-haiku-4-5-20251001 ($1/$5 per Mtok). Fast,
// cheap, more than enough for NL→JSON. Sonnet 4.6 for harder reasoning
// (vuln triage in v8.1).

const https = require('https');
const { AiProvider, AiProviderError } = require('./base');

const ANTHROPIC_API_VERSION = '2023-06-01';

class AnthropicProvider extends AiProvider {
  constructor(config) {
    super(config);
    if (!config.apiKey) throw new Error('AnthropicProvider requires apiKey');
    this.apiKey = config.apiKey;
    this.model = config.model || 'claude-haiku-4-5-20251001';
    this.baseUrl = config.endpointUrl || 'https://api.anthropic.com';
  }

  async test() {
    const start = Date.now();
    try {
      // Cheapest possible test: tiny message with a 1-token max. Verifies
      // key is valid + model accessible. Anthropic doesn't have a "list
      // models" or ping endpoint, so we have to actually invoke.
      const result = await this._request('POST', '/v1/messages', {
        model: this.model,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }, 5000);
      return {
        ok: true,
        model: this.model,
        latencyMs: Date.now() - start,
        modelEcho: result.model || this.model,
      };
    } catch (err) {
      return { ok: false, error: err.message, latencyMs: Date.now() - start };
    }
  }

  async structured(req) {
    const start = Date.now();
    const toolName = req.toolName || 'structured_output';
    const body = {
      model: this.model,
      max_tokens: req.maxTokens || 1024,
      system: req.systemPrompt,
      messages: [{ role: 'user', content: req.userPrompt }],
      tools: [{
        name: toolName,
        description: 'Return the structured output for the user request',
        input_schema: req.schema,
      }],
      // Force the model to call the tool — no free-text path.
      tool_choice: { type: 'tool', name: toolName },
    };

    let response;
    try {
      response = await this._request('POST', '/v1/messages', body, req.timeoutMs || 15000);
    } catch (err) {
      throw new AiProviderError(`Anthropic request failed: ${err.message}`, {
        code: err.code || 'network',
        statusCode: err.statusCode,
        retriable: err.retriable === true,
      });
    }

    // Find the tool_use block in the response content array
    const toolUse = (response.content || []).find(b => b.type === 'tool_use' && b.name === toolName);
    if (!toolUse) {
      throw new AiProviderError(
        `Anthropic returned no tool_use block. The model may have refused. ` +
        `Stop reason: ${response.stop_reason || 'unknown'}`,
        { code: 'no-tool-use' },
      );
    }

    return {
      data: toolUse.input,  // already parsed by Anthropic
      usage: {
        input: response.usage?.input_tokens || 0,
        output: response.usage?.output_tokens || 0,
      },
      model: response.model || this.model,
      latencyMs: Date.now() - start,
    };
  }

  _request(method, path, body, timeoutMs) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const payload = body ? JSON.stringify(body) : null;
      const req = https.request(url, {
        method,
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_API_VERSION,
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
            // Try to extract Anthropic's error message for a friendlier display
            let detail = text.substring(0, 200);
            try {
              const j = JSON.parse(text);
              if (j.error?.message) detail = j.error.message;
            } catch { /* leave raw */ }
            const err = new Error(`HTTP ${res.statusCode}: ${detail}`);
            err.code = `http-${res.statusCode}`;
            err.statusCode = res.statusCode;
            err.retriable = res.statusCode >= 500 || res.statusCode === 429;
            return reject(err);
          }
          try { resolve(JSON.parse(text)); }
          catch { reject(new Error('Anthropic returned non-JSON response')); }
        });
      });
      req.on('error', (err) => {
        const e = new Error(err.message);
        e.code = err.code;
        reject(e);
      });
      req.on('timeout', () => {
        req.destroy();
        const err = new Error('Anthropic request timed out');
        err.code = 'timeout';
        err.retriable = true;
        reject(err);
      });
      if (payload) req.write(payload);
      req.end();
    });
  }
}

module.exports = AnthropicProvider;
