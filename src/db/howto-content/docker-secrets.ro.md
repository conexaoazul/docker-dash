---
title: Gestionarea secretelor în Docker
summary: Folosește secretele Docker, fișierele .env și variabilele de mediu în siguranță. Nu hardcoda credențiale.
---

<h2>Gestionarea secretelor în Docker</h2>
<p>Secretele — parole, chei API, certificate — nu trebuie să apară niciodată în Dockerfile-uri, layere de imagini sau variabile de mediu care pot fi inspectate cu <code>docker inspect</code>.</p>

<h3>Modul greșit (Niciodată nu face asta)</h3>
<pre><code># RĂU: secretul este copt în layerul imaginii pentru totdeauna
ENV DATABASE_PASSWORD=mysecretpassword

# RĂU: vizibil în docker inspect
docker run -e DB_PASS=secret myapp</code></pre>

<h3>Secrete Docker Swarm (cel mai sigur)</h3>
<pre><code># Creează un secret dintr-un fișier
echo "mysecretpassword" | docker secret create db_password -

# Listează secretele
docker secret ls

# Folosește într-un serviciu
docker service create \
  --secret db_password \
  --env DB_PASSWORD_FILE=/run/secrets/db_password \
  myapp</code></pre>
<p>Secretele sunt montate ca fișiere la <code>/run/secrets/&lt;name&gt;</code> — niciodată stocate în variabile de mediu.</p>

<h3>Folosirea secretelor în Docker Compose</h3>
<pre><code>services:
  app:
    image: myapp
    secrets:
      - db_password
    environment:
      DB_PASSWORD_FILE: /run/secrets/db_password

secrets:
  db_password:
    file: ./secrets/db_password.txt  # doar dev local</code></pre>

<h3>Bune practici pentru fișierul .env</h3>
<ul>
  <li>Adaugă <code>.env</code> în <code>.gitignore</code> — nu-l commite niciodată</li>
  <li>Furnizează un <code>.env.example</code> cu valori dummy pentru documentație</li>
  <li>Folosește fișiere <code>.env</code> diferite per mediu: <code>.env.prod</code>, <code>.env.dev</code></li>
</ul>
