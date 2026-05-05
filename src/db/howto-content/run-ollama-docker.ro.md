---
title: Rulează Ollama în Docker (CPU și GPU)
summary: Ollama este modul cel mai simplu de a rula LLM-uri local (Llama, Qwen, DeepSeek, Mistral). Acest ghid îl deployează via Docker Dash, descarcă un model și îl interoghează din linia de comandă și din Docker Dash.
---

<h2>Ce primești</h2>
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
<pre><code>curl http://localhost:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
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
</ul>
