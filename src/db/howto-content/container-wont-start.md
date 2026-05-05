---
title: 'Container Won''t Start'
summary: 'Debug the most common reasons a container fails to start: exit codes, logs, permissions.'
category: troubleshooting
difficulty: beginner
icon: fas fa-exclamation-triangle
---

<h2>Container Won't Start — Debugging Guide</h2>
<p>When a container exits immediately or refuses to start, exit codes and logs tell the whole story.</p>

<h3>Step 1: Check the Exit Code</h3>
<pre><code>docker inspect --format='{{.State.ExitCode}}' &lt;container&gt;</code></pre>

<h3>Common Exit Codes</h3>
<ul>
  <li><strong>0</strong> — Clean exit (process finished normally)</li>
  <li><strong>1</strong> — Application error (check app logs)</li>
  <li><strong>126</strong> — Permission denied (entrypoint not executable)</li>
  <li><strong>127</strong> — Command not found (wrong entrypoint or PATH)</li>
  <li><strong>137</strong> — Killed by OOM killer (not enough memory)</li>
  <li><strong>139</strong> — Segmentation fault (crash in native code)</li>
  <li><strong>143</strong> — Graceful SIGTERM (usually intentional)</li>
</ul>

<h3>Step 2: Read the Logs</h3>
<pre><code>docker logs &lt;container&gt;
docker logs --tail=100 &lt;container&gt;</code></pre>

<h3>Step 3: Check Volume Mounts</h3>
<pre><code>docker inspect &lt;container&gt; | grep -A 20 Mounts</code></pre>
<p>Missing host paths cause immediate crashes. Verify the source directory exists.</p>

<h3>Step 4: Check Port Conflicts</h3>
<pre><code>docker inspect &lt;container&gt; | grep -A 10 PortBindings
ss -tlnp | grep :8080</code></pre>
<p>If another process already occupies the port, the container will fail to bind.</p>

<h3>Step 5: Try an Interactive Shell</h3>
<pre><code>docker run -it --entrypoint sh &lt;image&gt;</code></pre>
<p>Override the entrypoint to get a shell inside the image and investigate directly.</p>
