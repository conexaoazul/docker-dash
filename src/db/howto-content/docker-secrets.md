---
title: Managing Secrets in Docker
summary: Use Docker secrets, .env files, and environment variables securely. Never hardcode credentials.
category: security
difficulty: intermediate
icon: fas fa-user-secret
---

<h2>Managing Secrets in Docker</h2>
<p>Secrets — passwords, API keys, certificates — must never appear in Dockerfiles, image layers, or environment variables that can be inspected with <code>docker inspect</code>.</p>

<h3>The Wrong Way (Never Do This)</h3>
<pre><code># BAD: secret baked into the image layer forever
ENV DATABASE_PASSWORD=mysecretpassword

# BAD: visible in docker inspect
docker run -e DB_PASS=secret myapp</code></pre>

<h3>Docker Swarm Secrets (Most Secure)</h3>
<pre><code># Create a secret from a file
echo "mysecretpassword" | docker secret create db_password -

# List secrets
docker secret ls

# Use in a service
docker service create \
  --secret db_password \
  --env DB_PASSWORD_FILE=/run/secrets/db_password \
  myapp</code></pre>
<p>Secrets are mounted as files at <code>/run/secrets/&lt;name&gt;</code> — never stored in environment variables.</p>

<h3>Using Secrets in Docker Compose</h3>
<pre><code>services:
  app:
    image: myapp
    secrets:
      - db_password
    environment:
      DB_PASSWORD_FILE: /run/secrets/db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt  # local dev only</code></pre>

<h3>.env File Best Practices</h3>
<ul>
  <li>Add <code>.env</code> to <code>.gitignore</code> — never commit it</li>
  <li>Provide a <code>.env.example</code> with dummy values for documentation</li>
  <li>Use different <code>.env</code> files per environment: <code>.env.prod</code>, <code>.env.dev</code></li>
</ul>

<h3>Scanning for Leaked Secrets</h3>
<pre><code>docker history --no-trunc myimage | grep -i password
docker inspect mycontainer | grep -i secret</code></pre>
