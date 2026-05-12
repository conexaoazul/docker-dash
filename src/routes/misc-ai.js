'use strict';

// v8.2.x further-split: extracted from src/routes/misc.js.
// 2 routes for /ai/* — chat (Container Doctor) + github-compose generation.
// Mounted at /ai. Uses raw https requests to OpenAI / Ollama — no SDK.

const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.post('/chat', requireAuth, async (req, res) => {
  const { prompt, provider = 'ollama', config: aiConfig = {} } = req.body;
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  try {
    let response = '';

    if (provider === 'openai') {
      const apiKey = aiConfig.apiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) return res.status(400).json({ error: 'OpenAI API key not configured. Set OPENAI_API_KEY env var or provide it in the request.' });
      const model = aiConfig.model || 'gpt-4o-mini';
      const https = require('https');
      const body = JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 1500 });
      response = await new Promise((resolve, reject) => {
        const req2 = https.request({
          hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body) },
        }, (r) => {
          let data = '';
          r.on('data', d => { data += d; });
          r.on('end', () => {
            try { resolve(JSON.parse(data)?.choices?.[0]?.message?.content || 'No response'); }
            catch { resolve(data); }
          });
        });
        req2.on('error', reject);
        req2.write(body);
        req2.end();
      });

    } else if (provider === 'ollama') {
      const baseUrl = aiConfig.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434';
      const model = aiConfig.model || 'llama3';
      const http = require(baseUrl.startsWith('https') ? 'https' : 'http');
      const bodyStr = JSON.stringify({ model, prompt, stream: false });
      const urlObj = new URL(`${baseUrl.replace(/\/$/, '')}/api/generate`);
      response = await new Promise((resolve, reject) => {
        const req2 = http.request({
          hostname: urlObj.hostname, port: urlObj.port || (baseUrl.startsWith('https') ? 443 : 80),
          path: urlObj.pathname, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
        }, (r) => {
          let data = '';
          r.on('data', d => { data += d; });
          r.on('end', () => {
            try { resolve(JSON.parse(data)?.response || 'No response'); }
            catch { resolve(data); }
          });
        });
        req2.on('error', reject);
        req2.write(bodyStr);
        req2.end();
      });

    } else {
      return res.status(400).json({ error: `Unknown provider: ${provider}. Use 'openai' or 'ollama'.` });
    }

    res.json({ response });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── GitHub-to-Compose Generator ─────────────────────────────
// POST /api/ai/github-compose  { repoUrl, provider, config }
// Fetches README + package.json from GitHub, asks AI to generate docker-compose
router.post('/github-compose', requireAuth, async (req, res) => {
  const { repoUrl, provider = 'ollama', config: aiConfig = {} } = req.body;
  if (!repoUrl) return res.status(400).json({ error: 'repoUrl is required' });

  // Parse GitHub URL  → owner/repo
  const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/|$)/i);
  if (!match) return res.status(400).json({ error: 'Invalid GitHub URL. Expected: https://github.com/owner/repo' });
  const [, owner, repo] = match;

  try {
    const https = require('https');
    const fetchGH = (path) => new Promise((resolve) => {
      const opts = {
        hostname: 'raw.githubusercontent.com', path, method: 'GET',
        headers: { 'User-Agent': 'docker-dash/1.0' },
        timeout: 8000,
      };
      const req2 = https.request(opts, (r) => {
        let data = '';
        r.on('data', d => { data += d; });
        r.on('end', () => resolve(r.statusCode === 200 ? data : null));
      });
      req2.on('error', () => resolve(null));
      req2.on('timeout', () => { req2.destroy(); resolve(null); });
      req2.end();
    });

    // Fetch useful files (limit to avoid huge prompts)
    const [readme, pkgJson, requirements, goMod, pyProject, composeSample] = await Promise.all([
      fetchGH(`/${owner}/${repo}/HEAD/README.md`),
      fetchGH(`/${owner}/${repo}/HEAD/package.json`),
      fetchGH(`/${owner}/${repo}/HEAD/requirements.txt`),
      fetchGH(`/${owner}/${repo}/HEAD/go.mod`),
      fetchGH(`/${owner}/${repo}/HEAD/pyproject.toml`),
      fetchGH(`/${owner}/${repo}/HEAD/docker-compose.yml`)
        .then(r => r || fetchGH(`/${owner}/${repo}/HEAD/docker-compose.yaml`)),
    ]);

    // Build context (truncate to keep prompt manageable)
    const trim = (s, n = 1500) => s ? s.substring(0, n) + (s.length > n ? '\n...(truncated)' : '') : null;
    const context = [
      readme && `=== README ===\n${trim(readme, 2000)}`,
      pkgJson && `=== package.json ===\n${trim(pkgJson)}`,
      requirements && `=== requirements.txt ===\n${trim(requirements, 500)}`,
      goMod && `=== go.mod ===\n${trim(goMod, 500)}`,
      pyProject && `=== pyproject.toml ===\n${trim(pyProject, 500)}`,
      composeSample && `=== Existing compose (reference only) ===\n${trim(composeSample)}`,
    ].filter(Boolean).join('\n\n');

    if (!context) return res.status(422).json({ error: 'Could not fetch any files from the repository. Make sure it is public.' });

    const prompt = `You are a Docker expert. Analyze the following GitHub repository context and generate a production-ready docker-compose.yml file.

Repository: https://github.com/${owner}/${repo}

${context}

Requirements:
- Identify all services (web, database, cache, worker, etc.)
- Use appropriate Docker images with specific version tags (not :latest)
- Add health checks where applicable
- Include restart: unless-stopped
- Use named volumes for persistent data
- Define a custom network
- Add reasonable environment variable placeholders
- Add resource limits (mem_limit, cpus) for production

Respond with ONLY the docker-compose.yml content, no markdown fences, no explanations.`;

    // Reuse the ai/chat logic by making an internal call
    const callAi = async () => {
      if (provider === 'openai') {
        const apiKey = aiConfig.apiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error('OpenAI API key not configured');
        const model = aiConfig.model || 'gpt-4o-mini';
        const body = JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 2000 });
        return new Promise((resolve, reject) => {
          const req2 = https.request({
            hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}`, 'Content-Length': Buffer.byteLength(body) },
          }, (r) => {
            let data = '';
            r.on('data', d => { data += d; });
            r.on('end', () => {
              try { resolve(JSON.parse(data)?.choices?.[0]?.message?.content || 'No response'); }
              catch { resolve(data); }
            });
          });
          req2.on('error', reject);
          req2.write(body); req2.end();
        });
      } else {
        const baseUrl = aiConfig.baseUrl || process.env.OLLAMA_URL || 'http://localhost:11434';
        const model = aiConfig.model || 'llama3';
        const http2 = require(baseUrl.startsWith('https') ? 'https' : 'http');
        const bodyStr = JSON.stringify({ model, prompt, stream: false });
        const urlObj = new URL(`${baseUrl.replace(/\/$/, '')}/api/generate`);
        return new Promise((resolve, reject) => {
          const req2 = http2.request({
            hostname: urlObj.hostname, port: urlObj.port || (baseUrl.startsWith('https') ? 443 : 80),
            path: urlObj.pathname, method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
          }, (r) => {
            let data = '';
            r.on('data', d => { data += d; });
            r.on('end', () => {
              try { resolve(JSON.parse(data)?.response || 'No response'); }
              catch { resolve(data); }
            });
          });
          req2.on('error', reject);
          req2.write(bodyStr); req2.end();
        });
      }
    };

    const compose = await callAi();
    res.json({ compose, repo: `${owner}/${repo}` });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


module.exports = router;
