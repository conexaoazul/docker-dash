---
title: Primul tău stack Docker Compose
summary: Scrie primul tău fișier docker-compose.yml cu un server web și o bază de date.
---

<h2>Primul tău stack Docker Compose</h2>
<p>Docker Compose îți permite să definești aplicații multi-container într-un singur fișier YAML și să le gestionezi cu o singură comandă.</p>

<h2>Fișierul docker-compose.yml</h2>
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

<h2>Comenzi esențiale</h2>
<pre><code># Pornește toate serviciile în fundal
docker compose up -d

# Vezi serviciile active
docker compose ps

# Vezi logurile (toate serviciile)
docker compose logs -f

# Loguri pentru un serviciu specific
docker compose logs -f db

# Oprește toate serviciile (containerele rămân)
docker compose stop

# Oprește ȘI șterge containerele (volumele sunt păstrate)
docker compose down

# Șterge containerele ȘI volumele (distructiv!)
docker compose down -v

# Reconstruiește imaginile și repornește
docker compose up -d --build</code></pre>

<h2>Execută comenzi într-un serviciu</h2>
<pre><code># Deschide un shell în containerul web
docker compose exec web sh

# Rulează o comandă în db
docker compose exec db psql -U myuser mydb</code></pre>

<h3>Denumirea proiectului</h3>
<p>Implicit, Compose folosește numele directorului ca prefix de proiect (ex. <code>myproject_web_1</code>). Suprascrie cu <code>-p myproject</code> sau setează <code>COMPOSE_PROJECT_NAME</code> în fișierul <code>.env</code>.</p>
