---
title: Getting Started with Docker Dash
summary: 'A tour of Docker Dash features: dashboard, containers, security scanning, and more.'
category: docker-dash
difficulty: beginner
icon: fas fa-rocket
---

<h2>Getting Started with Docker Dash</h2>
<p>Docker Dash is a self-hosted dashboard that gives you full visibility and control over your Docker environment. Here is a quick tour to get you productive in minutes.</p>

<h3>1. Open the Dashboard</h3>
<p>Navigate to <code>http://&lt;your-server&gt;:3000</code>. The main dashboard shows a real-time overview: CPU, memory, active containers, and recent events.</p>

<h3>2. Browse Your Containers</h3>
<p>Click <strong>Containers</strong> in the sidebar. From here you can start, stop, restart, and delete containers. Click a container name to view its logs, stats, environment variables, and mounts.</p>

<h3>3. Deploy a Template</h3>
<p>Go to <strong>Templates</strong> to deploy popular self-hosted apps (Nginx, PostgreSQL, Nextcloud, etc.) with a single click. Fill in environment variables and port mappings, then hit <strong>Deploy</strong>.</p>

<h3>4. Scan for Vulnerabilities</h3>
<p>Open <strong>Security → Scan</strong> and select an image. Docker Dash runs Trivy under the hood and displays CVEs grouped by severity. Fix Critical and High issues first.</p>

<h3>5. Set Up Alerts</h3>
<p>Navigate to <strong>Alerts</strong> and create a rule — for example CPU &gt; 80% for 5 minutes. Connect a notification channel (Discord, Slack, Telegram, or email) to receive instant alerts.</p>

<h3>6. Connect More Hosts</h3>
<p>Under <strong>Hosts</strong> you can add remote Docker engines via TCP, SSH tunnel, or Unix socket. Switch between hosts instantly from the top navigation bar.</p>

<p>That is the essentials. Explore the <strong>How-To</strong> knowledge base for deeper guides on each feature.</p>
