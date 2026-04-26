'use strict';

// v8.0.1 — Three How-To guides for self-hosted AI workloads.
// Complement the AI Workload Template Pack shipped in this same release.
// Categories use a new `ai` category — first AI-themed howto entries.

exports.up = function (db) {
  const guides = [
    // ── 1. Run Ollama in Docker ──────────────────────────────────
    {
      slug: 'run-ollama-docker',
      title: 'Run Ollama in Docker (CPU and GPU)',
      title_ro: 'Rulează Ollama în Docker (CPU și GPU)',
      category: 'ai',
      difficulty: 'beginner',
      icon: 'fas fa-brain',
      summary: 'Ollama is the easiest way to run local LLMs (Llama, Qwen, DeepSeek, Mistral). This guide deploys it via Docker Dash, pulls a model, and queries it from the command line and from Docker Dash itself.',
      summary_ro: 'Ollama este modul cel mai simplu de a rula LLM-uri local (Llama, Qwen, DeepSeek, Mistral). Acest ghid îl deployează via Docker Dash, descarcă un model și îl interoghează din linia de comandă și din Docker Dash.',
      content: `<h2>What you get</h2>
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
curl http://localhost:11434/v1/chat/completions \\
  -H "Content-Type: application/json" \\
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
</ul>`,
      content_ro: `<h2>Ce primești</h2>
<ul>
  <li>Un server LLM local pe hardware-ul tău. Nimic nu părăsește rețeaua.</li>
  <li>API compatibil OpenAI la <code>http://&lt;host&gt;:11434</code> — majoritatea aplicațiilor care vorbesc cu OpenAI funcționează cu Ollama doar schimbând URL-ul.</li>
  <li>Modele descărcate la cerere: Llama 3.3, Qwen 2.5 Coder, DeepSeek R1, Mistral și 100+ altele de la <a href="https://ollama.ai/library" target="_blank">ollama.ai/library</a>.</li>
</ul>

<h2>Pasul 1: Deploy via template Docker Dash</h2>
<p>Templates → categoria AI → <strong>Ollama (LLM runtime)</strong> → Deploy. Alege:</p>
<ul>
  <li><strong>Doar CPU</strong>: deploy ca atare. Funcționează pentru modele ≤ 7B parametri la 1-5 tokeni/secundă.</li>
  <li><strong>GPU NVIDIA</strong>: decomentează blocul <code>deploy.resources.reservations.devices</code> din compose. Necesită <code>nvidia-container-toolkit</code> pe host (vezi ghidul de GPU passthrough).</li>
</ul>

<h2>Pasul 2: Descarcă un model</h2>
<p>De pe host, intră în container:</p>
<pre><code># Optimizat pentru cod, ~4.5GB pe disc, ~6GB RAM la runtime
docker exec ollama ollama pull qwen2.5-coder:7b

# General purpose, mai mic, ~2GB
docker exec ollama ollama pull llama3.2:3b

# Listează modelele instalate
docker exec ollama ollama list</code></pre>

<h2>Pasul 3: Interoghează API-ul</h2>
<pre><code>curl http://localhost:11434/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "qwen2.5-coder:7b",
    "messages": [{"role": "user", "content": "Scrie un bash one-liner pentru toate containerele care rulează"}]
  }'</code></pre>

<h2>Pasul 4: Folosește-l ca provider AI pentru Docker Dash însuși</h2>
<p>Settings → tab AI → alege <strong>Ollama (local)</strong> → endpoint URL <code>http://&lt;ip-host&gt;:11434</code> → alege <code>qwen2.5-coder:7b</code> → Test connection → Save → Enable. Acum audit NL search rulează pe LLM-ul tău, complet privat.</p>

<h2>Capcane comune</h2>
<ul>
  <li><strong>OOM la prima interogare.</strong> Setează limită memorie Docker mai mare decât RAM-ul de runtime al modelului (mărimea modelului + ~1 GB overhead).</li>
  <li><strong>"model not found".</strong> Rulează <code>ollama pull</code> în container — pull pe host nu ajută.</li>
  <li><strong>Lent pe CPU.</strong> Așteptat. Folosește modele 3B pentru viteză de chat; 7B+ sunt batch-tier pe CPU.</li>
</ul>`,
    },

    // ── 2. GPU passthrough to Docker ──────────────────────────────
    {
      slug: 'gpu-passthrough-docker',
      title: 'GPU passthrough to Docker containers (NVIDIA)',
      title_ro: 'GPU passthrough către containere Docker (NVIDIA)',
      category: 'ai',
      difficulty: 'intermediate',
      icon: 'fas fa-microchip',
      summary: 'Most AI workloads need GPU acceleration to be usable. This guide installs nvidia-container-toolkit, verifies the host can hand a GPU to Docker, and shows the compose syntax for GPU access.',
      summary_ro: 'Majoritatea workload-urilor AI au nevoie de accelerare GPU pentru a fi utilizabile. Acest ghid instalează nvidia-container-toolkit, verifică că host-ul poate da GPU-ul la Docker, și arată sintaxa compose pentru acces GPU.',
      content: `<h2>Prerequisites</h2>
<ul>
  <li>NVIDIA GPU on the host (confirm: <code>nvidia-smi</code> works on host)</li>
  <li>NVIDIA driver installed and matching CUDA version requirements (driver ≥ 550 for CUDA 12.4)</li>
  <li>Docker Engine ≥ 19.03 on the host</li>
</ul>

<h2>Step 1: Install nvidia-container-toolkit</h2>
<p>This package teaches Docker how to expose the GPU to containers via the <code>--gpus</code> flag.</p>

<h3>Ubuntu/Debian</h3>
<pre><code># Add the NVIDIA repo
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \\
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \\
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \\
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Configure Docker to use it
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker</code></pre>

<h3>RHEL/Fedora/Rocky</h3>
<pre><code>curl -s -L https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo \\
  | sudo tee /etc/yum.repos.d/nvidia-container-toolkit.repo
sudo dnf install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker</code></pre>

<h2>Step 2: Smoke test</h2>
<pre><code>docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi</code></pre>
<p>If you see your GPU listed (memory, driver version, processes), you're done. If it errors, the most common culprits:</p>
<ul>
  <li><strong>"could not select device driver "" with capabilities: [[gpu]]"</strong> — the toolkit isn't configured. Re-run <code>nvidia-ctk runtime configure</code>.</li>
  <li><strong>"unknown runtime: nvidia"</strong> — old install method. Use <code>--gpus all</code>, NOT <code>--runtime=nvidia</code>.</li>
  <li><strong>Driver/CUDA mismatch</strong> — host driver too old for the CUDA image. Use a base image matching your driver: <code>nvidia/cuda:11.8.0-base-ubuntu22.04</code> for older drivers.</li>
</ul>

<h2>Step 3: Use it in compose</h2>
<p>The Docker Dash AI templates ship with the GPU block commented out. Uncomment it for any AI workload:</p>
<pre><code>services:
  my-ai-service:
    image: ollama/ollama:latest
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all          # or 1 for a specific count
              capabilities: [gpu]</code></pre>
<p>For multiple GPUs, you can also use:</p>
<pre><code>            - driver: nvidia
              device_ids: ["0", "1"]    # specific GPU indexes
              capabilities: [gpu]</code></pre>

<h2>Step 4: Verify the container sees the GPU</h2>
<pre><code>docker exec my-ai-service nvidia-smi</code></pre>
<p>If you see the GPU listed inside the container, you're done. The AI workload will pick it up automatically (Ollama, vLLM, Stable Diffusion, ComfyUI all auto-detect).</p>

<h2>Multi-GPU + multi-tenant</h2>
<p>Pinning specific GPUs to specific containers prevents two heavy workloads from contending for the same VRAM:</p>
<pre><code>services:
  ollama:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ["0"]
              capabilities: [gpu]

  stable-diffusion:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              device_ids: ["1"]
              capabilities: [gpu]</code></pre>

<h2>AMD GPU</h2>
<p>AMD GPUs need <a href="https://rocm.docs.amd.com/en/latest/install/docker.html" target="_blank">ROCm Docker support</a>, configured separately. The compose syntax differs (use <code>devices: [/dev/kfd, /dev/dri]</code>). Most AI templates that say "GPU required" mean NVIDIA — verify ROCm support per project before deploying.</p>`,
      content_ro: `<h2>Prerechizite</h2>
<ul>
  <li>GPU NVIDIA pe host (confirmă: <code>nvidia-smi</code> funcționează pe host)</li>
  <li>Driver NVIDIA instalat (driver ≥ 550 pentru CUDA 12.4)</li>
  <li>Docker Engine ≥ 19.03 pe host</li>
</ul>

<h2>Pasul 1: Instalează nvidia-container-toolkit</h2>
<p>Pachetul învață Docker cum să expună GPU-ul către containere via flag-ul <code>--gpus</code>.</p>

<h3>Ubuntu/Debian</h3>
<pre><code>curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \\
  | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \\
  | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' \\
  | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker</code></pre>

<h2>Pasul 2: Test rapid</h2>
<pre><code>docker run --rm --gpus all nvidia/cuda:12.4.1-base-ubuntu22.04 nvidia-smi</code></pre>

<h2>Pasul 3: Folosește-l în compose</h2>
<pre><code>services:
  my-ai-service:
    image: ollama/ollama:latest
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]</code></pre>

<h2>Pasul 4: Verifică că containerul vede GPU-ul</h2>
<pre><code>docker exec my-ai-service nvidia-smi</code></pre>
<p>Workload-urile AI (Ollama, vLLM, Stable Diffusion, ComfyUI) detectează GPU-ul automat odată ce e disponibil în container.</p>

<h2>Multi-GPU</h2>
<p>Pin-uirea GPU-urilor specifice la containere previne competiția pentru aceeași memorie VRAM:</p>
<pre><code>            - driver: nvidia
              device_ids: ["0"]
              capabilities: [gpu]</code></pre>

<h2>GPU AMD</h2>
<p>GPU-urile AMD au nevoie de <a href="https://rocm.docs.amd.com/en/latest/install/docker.html" target="_blank">support ROCm</a> configurat separat. Sintaxa compose diferă. Majoritatea template-urilor AI care zic "GPU required" se referă la NVIDIA.</p>`,
    },

    // ── 3. Build a self-hosted RAG stack ──────────────────────────
    {
      slug: 'self-hosted-rag-stack',
      title: 'Build a self-hosted RAG stack (Ollama + Qdrant + Open WebUI)',
      title_ro: 'Construiește un stack RAG self-hosted (Ollama + Qdrant + Open WebUI)',
      category: 'ai',
      difficulty: 'intermediate',
      icon: 'fas fa-database',
      summary: 'Retrieval-augmented generation lets a local LLM answer questions about YOUR documents — manuals, specs, audit logs, anything. This guide deploys the full stack via Docker Dash, ingests a sample document, and queries it.',
      summary_ro: 'Retrieval-augmented generation permite unui LLM local să răspundă la întrebări despre documentele TALE — manuale, specificații, audit log-uri, orice. Acest ghid deployează stack-ul complet via Docker Dash, ingerează un document și îl interoghează.',
      content: `<h2>What RAG is, in one paragraph</h2>
<p>An LLM by itself only knows what was in its training data — cutoff date, no proprietary knowledge. RAG fixes this by: (1) chunking your documents into pieces, (2) computing embeddings (vector representations) of each chunk and storing them in a vector database, (3) at query time, finding the chunks most similar to the question and (4) feeding them to the LLM as context. Result: accurate answers about YOUR data, with citations.</p>

<h2>Architecture</h2>
<pre style="background:var(--bg-dim);padding:12px;border-radius:6px;font-family:monospace;font-size:11px">
You
 │
 ▼  question
[Open WebUI]  ─── chat UI; manages workspaces, doc upload, RAG settings
 │
 ▼  query
[Ollama]      ─── LLM inference + embedding model (nomic-embed-text)
 │
 ▼  vector search
[Qdrant]      ─── stores embeddings, returns top-k similar chunks
</pre>

<h2>Step 1: Deploy via template</h2>
<p>Templates → AI category → <strong>RAG Stack (Ollama + Qdrant + Open WebUI)</strong> → Deploy. Three containers come up: <code>ollama-rag</code> (port 11434 internal), <code>qdrant</code> (6333), <code>open-webui-rag</code> (3000 published).</p>

<h2>Step 2: Pull the models you need</h2>
<p>You need TWO models for RAG: a chat model (answers questions) and an embedding model (turns text into vectors).</p>
<pre><code># Chat model — pick by your hardware
docker exec ollama-rag ollama pull qwen2.5-coder:7b

# Embedding model — fast, small, purpose-built
docker exec ollama-rag ollama pull nomic-embed-text</code></pre>

<h2>Step 3: First-run setup in Open WebUI</h2>
<ol>
  <li>Open <code>http://&lt;host&gt;:3000</code> in your browser.</li>
  <li>Create the admin account (first sign-up becomes admin).</li>
  <li>Settings (top right) → <strong>Documents</strong>. Verify the embedding model is set to <code>nomic-embed-text</code> and the vector DB shows <code>qdrant</code>.</li>
  <li>Settings → <strong>Models</strong> → confirm <code>qwen2.5-coder:7b</code> appears (or whichever chat model you pulled).</li>
</ol>

<h2>Step 4: Ingest a document</h2>
<p>Two paths:</p>

<h3>Path A — workspace document (chat-scoped)</h3>
<ol>
  <li>Workspaces → New Workspace → name it (e.g. "Docker docs").</li>
  <li>Inside the workspace, click the paperclip icon in the chat input.</li>
  <li>Upload a PDF, Markdown, or text file. Embedding takes seconds for small files, minutes for large ones.</li>
  <li>Ask a question. The LLM will cite the chunks it used.</li>
</ol>

<h3>Path B — knowledge base (shared across workspaces)</h3>
<ol>
  <li>Settings → Documents → <strong>Knowledge</strong>.</li>
  <li>Create a knowledge base, upload files. Files persist across all chats that reference this knowledge base via <code>#knowledge-base-name</code> in the prompt.</li>
</ol>

<h2>Step 5: Verify it's actually using your data</h2>
<p>Ask a question whose answer is ONLY in your uploaded doc — the LLM shouldn't know it from training data. If the response cites the right chunks (Open WebUI shows them inline), RAG is working.</p>

<h2>Tuning</h2>
<ul>
  <li><strong>Chunk size</strong>: Settings → Documents → "Chunk size" (default 1500 chars). Smaller = more precise retrieval but more chunks needed; larger = better context for one chunk but worse precision.</li>
  <li><strong>Top K</strong>: how many chunks the LLM sees per query (default 5). Increase for technical questions, decrease for short answers.</li>
  <li><strong>Hybrid search</strong>: Settings → Documents → enable "Hybrid Search" (BM25 + semantic). Better recall for queries that include exact terms (function names, error codes).</li>
</ul>

<h2>Common gotchas</h2>
<ul>
  <li><strong>Empty answers</strong>: embedding model not pulled. Check <code>docker exec ollama-rag ollama list</code> shows <code>nomic-embed-text</code>.</li>
  <li><strong>Slow ingestion</strong>: large PDFs (1000+ pages) can take 10+ min. Switch to a smaller embedding model or run Ollama on GPU.</li>
  <li><strong>"Vector DB connection failed"</strong>: Qdrant container died (OOM common with 5GB+ knowledge bases). Bump <code>mem_limit</code> on the qdrant service.</li>
  <li><strong>Cited chunks irrelevant</strong>: chunks are too large or too small. Try chunk size 500 or 3000 (extreme ends) and see which works for your data.</li>
</ul>

<h2>Privacy stance</h2>
<p>Everything runs locally. Documents never leave your network. No API keys needed. This is the same architecture commercial RAG products (Glean, NotebookLM) use — but you own all the data and there's no monthly bill.</p>`,
      content_ro: `<h2>Ce e RAG, într-un paragraf</h2>
<p>Un LLM singur știe doar ce era în datele lui de antrenament — limită de timp, fără cunoștințe proprietare. RAG rezolvă asta: (1) împarte documentele tale în bucăți, (2) calculează embeddings (vectori) pentru fiecare bucată și le stochează într-o bază vectorială, (3) la query, găsește bucățile cele mai similare cu întrebarea și (4) le dă la LLM ca context. Rezultat: răspunsuri precise despre datele TALE, cu citări.</p>

<h2>Pasul 1: Deploy via template</h2>
<p>Templates → categoria AI → <strong>RAG Stack</strong> → Deploy. Trei containere: <code>ollama-rag</code>, <code>qdrant</code>, <code>open-webui-rag</code> (port 3000 expus).</p>

<h2>Pasul 2: Descarcă modelele necesare</h2>
<p>Ai nevoie de DOUĂ modele: unul de chat și unul de embedding.</p>
<pre><code>docker exec ollama-rag ollama pull qwen2.5-coder:7b
docker exec ollama-rag ollama pull nomic-embed-text</code></pre>

<h2>Pasul 3: Setup inițial în Open WebUI</h2>
<ol>
  <li>Deschide <code>http://&lt;host&gt;:3000</code>.</li>
  <li>Creează contul de admin (primul sign-up devine admin).</li>
  <li>Settings → Documents → confirmă că embedding e <code>nomic-embed-text</code> și vector DB e <code>qdrant</code>.</li>
</ol>

<h2>Pasul 4: Încarcă un document</h2>
<p>Workspaces → New → numește-l → click pe paperclip în chat → upload PDF/MD/text → așteaptă embedding. Apoi pune o întrebare — LLM-ul va cita bucățile folosite.</p>

<h2>Pasul 5: Verifică</h2>
<p>Pune o întrebare al cărei răspuns e DOAR în documentul tău — LLM-ul n-ar trebui să-l știe din antrenament. Dacă răspunde corect cu citări, RAG funcționează.</p>

<h2>Tuning</h2>
<ul>
  <li><strong>Chunk size</strong>: Settings → Documents → "Chunk size" (default 1500). Mai mic = retrieval mai precis dar mai multe bucăți; mai mare = context mai bun per bucată dar precizie mai slabă.</li>
  <li><strong>Top K</strong>: câte bucăți vede LLM-ul per query (default 5).</li>
  <li><strong>Hybrid search</strong>: Settings → Documents → enable "Hybrid Search" (BM25 + semantic). Recall mai bun pentru query-uri cu termeni exacți.</li>
</ul>

<h2>Capcane comune</h2>
<ul>
  <li><strong>Răspunsuri goale</strong>: modelul de embedding nu e descărcat.</li>
  <li><strong>Ingestion lent</strong>: PDF-uri mari (1000+ pagini) pot lua 10+ min. Ollama pe GPU ajută.</li>
  <li><strong>"Vector DB connection failed"</strong>: Qdrant a murit (OOM). Crește <code>mem_limit</code> pe qdrant.</li>
</ul>

<h2>Privacy</h2>
<p>Totul rulează local. Documentele nu părăsesc rețeaua. Fără chei API. Aceeași arhitectură ca produsele comerciale RAG (Glean, NotebookLM) — dar tu deții toate datele și nu plătești lunar.</p>`,
    },
  ];

  const stmt = db.prepare(`
    INSERT INTO howto_guides (slug, title, title_ro, category, difficulty, icon, summary, summary_ro, content, content_ro, is_builtin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title, title_ro = excluded.title_ro,
      category = excluded.category, difficulty = excluded.difficulty,
      icon = excluded.icon, summary = excluded.summary, summary_ro = excluded.summary_ro,
      content = excluded.content, content_ro = excluded.content_ro,
      is_builtin = 1
  `);

  for (const g of guides) {
    stmt.run(g.slug, g.title, g.title_ro, g.category, g.difficulty, g.icon, g.summary, g.summary_ro, g.content, g.content_ro);
  }
};

exports.down = function (db) {
  db.prepare(`DELETE FROM howto_guides WHERE slug IN ('run-ollama-docker', 'gpu-passthrough-docker', 'self-hosted-rag-stack') AND is_builtin = 1`).run();
};
