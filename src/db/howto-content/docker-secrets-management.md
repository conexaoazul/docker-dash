---
title: Docker Secrets Management
summary: Use Docker secrets with the _FILE pattern to keep credentials out of env vars and image layers.
category: security
difficulty: intermediate
icon: fas fa-user-secret
---

<h2>Why Not Environment Variables?</h2>
<p>Putting secrets in <code>environment:</code> exposes them in: <strong>docker inspect</strong>, process listing (<code>ps aux</code>), container logs, and crash dumps. Anyone with access to the Docker socket can read them.</p>

<h2>The _FILE Pattern</h2>
<p>Most modern images (postgres, mysql, mariadb, redis, nginx) support reading secrets from a file via the <code>_FILE</code> suffix. Instead of:</p>
<pre><code>environment:
  POSTGRES_PASSWORD: my-secret-pass</code></pre>
<p>Use:</p>
<pre><code>environment:
  POSTGRES_PASSWORD_FILE: /run/secrets/db_password
secrets:
  - db_password</code></pre>

<h2>Setup with docker-compose</h2>
<pre><code>services:
  db:
    image: postgres:16
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

secrets:
  db_password:
    file: /etc/myapp/secrets/db_password.txt</code></pre>

<h2>Create the Secret File (Correct Way)</h2>
<pre><code># CRITICAL: use printf, NEVER echo (echo adds \n which breaks credentials)
sudo mkdir -p /etc/myapp/secrets
sudo sh -c 'printf "%s" "$(openssl rand -base64 24)" > /etc/myapp/secrets/db_password.txt'
sudo chmod 600 /etc/myapp/secrets/db_password.txt
sudo chown root:docker /etc/myapp/secrets/db_password.txt</code></pre>

<h2>Common Pitfalls</h2>
<ul>
  <li><strong>echo adds newline:</strong> <code>echo "secret" > file</code> stores <code>secret\n</code> — many drivers include the newline literally, causing silent auth failures.</li>
  <li><strong>Permissions matter:</strong> file must be 600 (root + docker group only).</li>
  <li><strong>Don't commit:</strong> add <code>secrets/</code> to .gitignore.</li>
  <li><strong>App must support _FILE:</strong> custom apps need to read the file themselves.</li>
</ul>

<h2>Verify in the Container</h2>
<pre><code># Files appear at /run/secrets/&lt;name&gt;
docker exec mycontainer ls -la /run/secrets/
docker exec mycontainer cat /run/secrets/db_password</code></pre>
