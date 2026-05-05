---
title: Gestionarea Docker Secrets
summary: Folosește Docker secrets cu pattern-ul _FILE pentru a ține credențialele în afara env vars și layerelor de imagine.
---

<h2>De ce nu Environment Variables?</h2>
<p>Punerea secretelor în <code>environment:</code> le expune în: <strong>docker inspect</strong>, listarea proceselor (<code>ps aux</code>), logurile containerului și crash dumps. Oricine are acces la Docker socket le poate citi.</p>

<h2>Pattern-ul _FILE</h2>
<p>Majoritatea imaginilor moderne (postgres, mysql, mariadb, redis, nginx) suportă citirea secretelor dintr-un fișier prin sufixul <code>_FILE</code>. În loc de:</p>
<pre><code>environment:
  POSTGRES_PASSWORD: my-secret-pass</code></pre>
<p>Folosește:</p>
<pre><code>environment:
  POSTGRES_PASSWORD_FILE: /run/secrets/db_password
secrets:
  - db_password</code></pre>

<h2>Configurare cu docker-compose</h2>
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

<h2>Creare fișier secret (modul corect)</h2>
<pre><code># CRITIC: folosește printf, NICIODATĂ echo (echo adaugă \n care strică credențialele)
sudo mkdir -p /etc/myapp/secrets
sudo sh -c 'printf "%s" "$(openssl rand -base64 24)" > /etc/myapp/secrets/db_password.txt'
sudo chmod 600 /etc/myapp/secrets/db_password.txt
sudo chown root:docker /etc/myapp/secrets/db_password.txt</code></pre>

<h2>Capcane comune</h2>
<ul>
  <li><strong>echo adaugă newline:</strong> <code>echo "secret" > file</code> stochează <code>secret\n</code> — multe drivere includ newline-ul literal, cauzând eșecuri silențioase de autentificare.</li>
  <li><strong>Permisiunile contează:</strong> fișierul trebuie să fie 600 (doar root + grupul docker).</li>
  <li><strong>Nu face commit:</strong> adaugă <code>secrets/</code> în .gitignore.</li>
  <li><strong>App-ul trebuie să suporte _FILE:</strong> aplicațiile custom trebuie să citească fișierul singure.</li>
</ul>

<h2>Verificare în container</h2>
<pre><code># Fișierele apar la /run/secrets/&lt;name&gt;
docker exec mycontainer ls -la /run/secrets/
docker exec mycontainer cat /run/secrets/db_password</code></pre>
