---
title: Your First Docker Compose Stack
summary: Write your first docker-compose.yml file with a web server and database.
category: compose
difficulty: beginner
icon: fas fa-layer-group
---

<h2>Your First Docker Compose Stack</h2>
<p>Docker Compose lets you define multi-container applications in a single YAML file and manage them with one command.</p>

<h2>The docker-compose.yml file</h2>
<pre><code>services:
  web:
    image: nginx:alpine
    ports:
      - "8080:80"
    volumes:
      - ./html:/usr/share/nginx/html:ro
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: myuser
      POSTGRES_PASSWORD: mypassword
      POSTGRES_DB: mydb
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:</code></pre>

<h2>Essential commands</h2>
<pre><code># Start all services in the background
docker compose up -d

# View running services
docker compose ps

# View logs (all services)
docker compose logs -f

# View logs for a specific service
docker compose logs -f db

# Stop all services (containers remain)
docker compose stop

# Stop AND remove containers (volumes are kept)
docker compose down

# Remove containers AND volumes (destructive!)
docker compose down -v

# Rebuild images and restart
docker compose up -d --build</code></pre>

<h2>Execute commands inside a service</h2>
<pre><code># Open a shell in the web container
docker compose exec web sh

# Run a one-off command in db
docker compose exec db psql -U myuser mydb</code></pre>

<h3>Project naming</h3>
<p>By default, Compose uses the directory name as the project prefix (e.g., <code>myproject_web_1</code>). Override with <code>-p myproject</code> or set <code>COMPOSE_PROJECT_NAME</code> in your <code>.env</code> file.</p>
