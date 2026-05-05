---
title: Variabile de mediu în Compose
summary: Folosește fișiere .env și variabile de mediu pentru a configura stackurile Compose.
---

<h2>Variabile de mediu în Docker Compose</h2>
<p>Codificarea parolelor și a configurației direct în docker-compose.yml este un risc de securitate. Variabilele de mediu țin valorile sensibile în afara controlului de versiune.</p>

<h2>Fișierul .env</h2>
<p>Creează un fișier <code>.env</code> în același director cu <code>docker-compose.yml</code>:</p>
<pre><code># .env
POSTGRES_USER=myuser
POSTGRES_PASSWORD=supersecret
POSTGRES_DB=mydb
APP_PORT=3000</code></pre>
<p><strong>Adaugă .env în .gitignore imediat:</strong></p>
<pre><code>echo ".env" >> .gitignore</code></pre>

<h2>Referențierea variabilelor în Compose</h2>
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

<h2>Directiva env_file</h2>
<p>Încarcă toate variabilele dintr-un fișier fără a le lista individual:</p>
<pre><code>services:
  app:
    image: myapp
    env_file:
      - .env
      - .env.local   # suprascrieri locale</code></pre>

<h2>Secțiunea environment inline</h2>
<pre><code>services:
  app:
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db/mydb</code></pre>

<h2>Furnizează un fișier .env.example</h2>
<p>Commit-ează un <code>.env.example</code> (cu valori placeholder) pentru ca membrii echipei să știe ce variabile sunt necesare:</p>
<pre><code># .env.example
POSTGRES_USER=changeme
POSTGRES_PASSWORD=changeme
POSTGRES_DB=mydb
APP_PORT=3000</code></pre>

<h3>Prioritatea variabilelor (de la cea mai mare la cea mai mică)</h3>
<ul>
  <li>Variabile de mediu din shell</li>
  <li>Variabile setate cu flag-ul <code>-e KEY=VALUE</code></li>
  <li>Secțiunea <code>environment:</code> din fișierul compose</li>
  <li>Fișierul <code>.env</code></li>
  <li>Valorile implicite <code>ENV</code> din Dockerfile</li>
</ul>
