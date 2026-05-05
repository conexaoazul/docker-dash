---
title: Run Ollama in Docker (CPU and GPU)
summary: Ollama is the easiest way to run local LLMs (Llama, Qwen, DeepSeek, Mistral). This guide deploys it via Docker Dash, pulls a model, and queries it from the command line and from Docker Dash itself.
category: ai
difficulty: beginner
icon: fas fa-brain
---

<h2>What you get</h2>
<ul>
  <li>A local LLM server running on your hardware. No data leaves your network.</li>
  <li>OpenAI-compatible API at <code>http://&lt;host&gt;:11434</code> — most apps that talk to OpenAI work against Ollama by changing the base URL.</li>
  <li>Models you can pull on demand: Llama 3.3, Qwen 2.5 Coder, DeepSeek R1, Mistral, and 100+ others from <a href="https://ollama.ai/library" target="_blank">ollama.ai/library</a>.</li>
</ul>

<h2>Step 1: Deploy via Docker Dash template</h2>
<p>Templates → AI category → <strong>Ollama (LLM runtime)</strong> → Deploy. Choose:</p>
<ul>
  <li><strong>CPU only</strong>: deploy as-is. Works for models ≤ 7B parameters at 1-5 tokens/second.</li>
  <li><strong>NVIDIA GPU</strong>: uncomment the <code>deploy.resources.reservations.devices</code> block in the compose. Requires <code>nvidia-container-toolkit</code> on the host (see the GPU passthrough guide).</li>
</ul>

<h2>Step 2: Pull a model</h2>
<p>From the host, exec into the container:</p>
<pre><code># Coder-tuned, ~4.5GB on disk, ~6GB RAM at runtime
docker exec ollama ollama pull qwen2.5-coder:7b

# General-purpose, smaller, ~2GB
docker exec ollama ollama pull llama3.2:3b

# List installed models
docker exec ollama ollama list</code></pre>
<p>Models persist in the <code>ollama-data</code> volume across container restarts.</p>

<h2>Step 3: Query the API</h2>
<pre><code># OpenAI-compatible endpoint
curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen2.5-coder:7b",
    "messages": [{"role": "user", "content": "Write a bash one-liner to list all running containers"}]
  }'

# Ollama-native endpoint (simpler)
curl http://localhost:11434/api/generate -d '{
  "model": "qwen2.5-coder:7b",
  "prompt": "Hello world",
  "stream": false
}'</code></pre>

<h2>Step 4: Use it as the AI provider for Docker Dash itself</h2>
<p>Settings → AI tab → pick <strong>Ollama (local)</strong> → endpoint URL <code>http://&lt;host-ip&gt;:11434</code> (or <code>http://ollama:11434</code> if Docker Dash is on the same compose network) → pick <code>qwen2.5-coder:7b</code> → Test connection → Save → Enable. Now your audit NL search runs against your own LLM, fully private.</p>

<h2>Resource expectations</h2>
<table style="border-collapse:collapse;width:100%">
<tr style="background:var(--bg-dim)"><th style="padding:6px;text-align:left">Model</th><th style="padding:6px">Disk</th><th style="padding:6px">RAM (CPU)</th><th style="padding:6px">VRAM (GPU)</th><th style="padding:6px">Speed (CPU vs GPU)</th></tr>
<tr><td style="padding:6px">llama3.2:3b</td><td style="padding:6px">2 GB</td><td style="padding:6px">4 GB</td><td style="padding:6px">3 GB</td><td style="padding:6px">5-15 vs 60+ tok/s</td></tr>
<tr><td style="padding:6px">qwen2.5-coder:7b</td><td style="padding:6px">4.5 GB</td><td style="padding:6px">6 GB</td><td style="padding:6px">5 GB</td><td style="padding:6px">2-8 vs 40+ tok/s</td></tr>
<tr><td style="padding:6px">llama3.3:70b</td><td style="padding:6px">40 GB</td><td style="padding:6px">48 GB+</td><td style="padding:6px">40 GB+</td><td style="padding:6px">unusable vs 20+ tok/s</td></tr>
</table>

<h2>Common gotchas</h2>
<ul>
  <li><strong>OOM-killed on first query.</strong> Set a Docker memory limit higher than the model's runtime RAM (sum of model size + ~1 GB overhead).</li>
  <li><strong>"model not found".</strong> Run <code>ollama pull</code> inside the container — pulling on the host won't help.</li>
  <li><strong>Slow on CPU.</strong> Expected. Use 3B models for chat-speed; 7B+ are batch-tier on CPU.</li>
  <li><strong>NVIDIA GPU not detected.</strong> Verify on host: <code>docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi</code>. If that fails, the GPU passthrough howto fixes it.</li>
</ul>
