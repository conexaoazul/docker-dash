---
title: Build a self-hosted RAG stack (Ollama + Qdrant + Open WebUI)
summary: Retrieval-augmented generation lets a local LLM answer questions about YOUR documents — manuals, specs, audit logs, anything. This guide deploys the full stack via Docker Dash, ingests a sample document, and queries it.
category: ai
difficulty: intermediate
icon: fas fa-database
---

<h2>What RAG is, in one paragraph</h2>
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
<p>Everything runs locally. Documents never leave your network. No API keys needed. This is the same architecture commercial RAG products (Glean, NotebookLM) use — but you own all the data and there's no monthly bill.</p>
