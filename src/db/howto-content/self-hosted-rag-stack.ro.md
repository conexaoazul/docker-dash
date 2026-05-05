---
title: Construiește un stack RAG self-hosted (Ollama + Qdrant + Open WebUI)
summary: Retrieval-augmented generation permite unui LLM local să răspundă la întrebări despre documentele TALE — manuale, specificații, audit log-uri, orice. Acest ghid deployează stack-ul complet via Docker Dash, ingerează un document și îl interoghează.
---

<h2>Ce e RAG, într-un paragraf</h2>
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
<p>Totul rulează local. Documentele nu părăsesc rețeaua. Fără chei API. Aceeași arhitectură ca produsele comerciale RAG (Glean, NotebookLM) — dar tu deții toate datele și nu plătești lunar.</p>
