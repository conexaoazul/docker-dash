---
title: Environment Variables in Compose
summary: Use .env files and environment variables to configure your Docker Compose stacks.
category: compose
difficulty: beginner
icon: fas fa-key
---

<h2>Environment Variables in Docker Compose</h2>
<p>Hard-coding passwords and configuration in docker-compose.yml is a security risk. Environment variables keep sensitive values out of version control.</p>

<h2>The .env file</h2>
<p>Create a <code>.env</code> file in the same directory as <code>docker-compose.yml</code>:</p>
<pre><code># .env
POSTGRES_USER=myuser
POSTGRES_PASSWORD=supersecret
POSTGRES_DB=mydb
APP_PORT=3000</code></pre>
<p><strong>Add .env to .gitignore immediately:</strong></p>
<pre><code>echo ".env" >> .gitignore</code></pre>

<h2>Reference variables in Compose</h2>
<pre><code>services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
  app:
    image: myapp
    ports:
      - "${APP_PORT}:3000"</code></pre>

<h2>The env_file directive</h2>
<p>Load all variables from a file without listing them individually:</p>
<pre><code>services:
  app:
    image: myapp
    env_file:
      - .env
      - .env.local   # local overrides</code></pre>

<h2>Inline environment section</h2>
<pre><code>services:
  app:
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db/mydb</code></pre>

<h2>Provide a .env.example file</h2>
<p>Commit a <code>.env.example</code> (with placeholder values) so teammates know which variables are required:</p>
<pre><code># .env.example
POSTGRES_USER=changeme
POSTGRES_PASSWORD=changeme
POSTGRES_DB=mydb
APP_PORT=3000</code></pre>

<h3>Variable precedence (highest to lowest)</h3>
<ul>
  <li>Shell environment variables</li>
  <li>Variables set with <code>-e KEY=VALUE</code> flag</li>
  <li><code>environment:</code> section in compose file</li>
  <li><code>.env</code> file</li>
  <li>Dockerfile <code>ENV</code> defaults</li>
</ul>
