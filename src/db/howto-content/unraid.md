---
title: Connect Docker Dash to Unraid
summary: Unraid runs standard Docker + SSH out of the box — this is the easiest NAS platform to connect. Point Docker Dash at your Tower and go.
category: multi-host
difficulty: beginner
icon: fab fa-docker
---

<h2>What you need</h2>
<ul>
  <li>Unraid 6.9 or later</li>
  <li>SSH enabled in Unraid Settings (usually on by default)</li>
  <li>Docker Dash running somewhere reachable</li>
</ul>

<h2>Step 1: Verify SSH is on</h2>
<p>In the Unraid UI:</p>
<ol>
  <li><strong>Settings → Management Access → SSH</strong></li>
  <li>Make sure <strong>Use SSH</strong> is set to <em>Yes</em></li>
  <li>Port defaults to <code>22</code></li>
</ol>
<p>If you've never logged into Unraid via SSH before, you might want to set up a key-based login (Settings → User Utilities → User Profile → SSH Authorized Keys). Not required, but more robust than the root password.</p>

<h2>Step 2: Add the host in Docker Dash</h2>
<ol>
  <li><strong>Multi-Host → Add Host</strong></li>
  <li>Connection type: <strong>SSH tunnel</strong></li>
  <li>Host: your Unraid's IP or <code>tower.local</code></li>
  <li>Port: <code>22</code></li>
  <li>Username: <code>root</code> (Unraid runs everything as root)</li>
  <li>Auth: your Unraid root password OR your SSH private key</li>
  <li>Docker socket path: <code>/var/run/docker.sock</code> (default — Unraid doesn't relocate it)</li>
  <li>Test connection → ✓</li>
  <li>Save</li>
</ol>

<h2>Step 3: Verify the badge</h2>
<p>Multi-Host page. Look for an <strong>Unraid</strong> badge on the host card. Docker Dash's platform detection reads Unraid's OS string from <code>docker info</code>.</p>

<h2>Unraid-specific tips</h2>

<h3>appdata convention</h3>
<p>Unraid community stacks almost always expect <code>/mnt/user/appdata/&lt;service&gt;</code> as the config volume. When deploying compose stacks through Docker Dash, keep this convention — it plays well with existing Community Apps (CA) installs and lets you migrate between CA and Docker Dash without rewiring storage.</p>

<h3>Community Applications &amp; Docker Dash</h3>
<p>They coexist. Unraid's Docker tab and Docker Dash both read the same underlying Docker daemon. You can install from CA as usual, then manage / remediate / audit from Docker Dash.</p>

<h3>Outbound filter on Unraid</h3>
<p>Works perfectly — Unraid uses a standard bridge network. See <a href="#/howto/outbound-network-filter">the Outbound Filter guide</a>.</p>

<h2>Troubleshooting</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Problem</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">SSH connects, Docker commands hang</td><td style="padding:6px">Docker service may be off. In Unraid UI: <strong>Settings → Docker</strong> → <em>Enable Docker</em> = Yes.</td></tr>
<tr><td style="padding:6px">Root login not working</td><td style="padding:6px">Unraid 7+ made root SSH key-only by default. Add a key in Settings → User Utilities → User Profile → SSH Authorized Keys.</td></tr>
<tr><td style="padding:6px">Tower hostname doesn't resolve</td><td style="padding:6px">Use the IP instead. Set a static IP for your Unraid in Settings → Network Settings.</td></tr>
</table>

