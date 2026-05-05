---
title: printf vs echo — Capcana newline
summary: De ce echo strică silențios secretele și credențialele, și fix-ul de o linie care previne ore de debugging.
---

<h2>Problema în 30 de secunde</h2>
<pre><code>echo "my-password" > /etc/myapp/secrets/db_password
# Conținut fișier: my-password\n   ← newline adăugat!
# Driver-ul DB încearcă autentificare cu "my-password\n"
# Rezultat: eșec silențios de autentificare</code></pre>

<h2>De ce echo adaugă newline</h2>
<p>POSIX <code>echo</code> adaugă <code>\n</code> by default. Asta are sens pentru output în terminal (fiecare linie se termină cu newline), dar strică totul când scrii date byte-perfect ca parole, API keys, sau cert-uri TLS.</p>

<h2>Fix-ul: printf %s</h2>
<pre><code># CORECT: printf NU adaugă newline
printf '%s' "my-password" > /etc/myapp/secrets/db_password

# Verifică (lipsa $ la sfârșitul liniei a 2-a = fără newline):
cat /etc/myapp/secrets/db_password | xxd | tail -2</code></pre>

<h2>Eșecuri reale prevenite de fix</h2>
<ul>
  <li><strong>tedious (driver Node MSSQL):</strong> include newline-ul în string-ul parolei, returnează "Login failed for user".</li>
  <li><strong>libssh:</strong> parsarea cheii private eșuează din cauza newline-ului → "no matching authentication method".</li>
  <li><strong>JWT keys:</strong> verificarea semnăturii eșuează pentru că byte-urile cheii nu se potrivesc.</li>
  <li><strong>API tokens în header-e:</strong> serverul vede <code>Authorization: Bearer abc123\n</code> și îl respinge.</li>
</ul>

<h2>Variante comune de evitat</h2>
<pre><code># RĂU — toate adaugă newline:
echo "secret" > file
echo -n "secret" > file       # -n nu e portabil; busybox echo îl ignoră
"$VAR" > file                  # bash: adaugă newline
cat &lt;&lt;&lt; "secret" > file        # here-string adaugă și el newline

# BUN:
printf '%s' "secret" > file
print -n "secret" > file       # doar zsh/ksh
echo -E -n "secret" > file     # bash cu flag-uri explicite (tot riscant)</code></pre>

<h2>Pattern-ul cu ghilimele (pentru command substitution)</h2>
<pre><code># În subshell-uri, înfășoară mereu în printf:
sudo sh -c 'printf "%s" "$(openssl rand -base64 24)" > /etc/secrets/key'

# NU așa:
sudo sh -c 'echo "$(openssl rand -base64 24)" > /etc/secrets/key'  # adaugă newline</code></pre>

<h2>Detectarea daunelor existente</h2>
<pre><code># Găsește fișierele secrete cu newline la final (ultimul byte e 0x0a):
for f in /etc/myapp/secrets/*; do
  if [ "$(tail -c 1 "$f" | xxd -p)" = "0a" ]; then
    echo "TRAILING NEWLINE: $f"
  fi
done

# Fix in place (elimină newline final):
truncate -s -1 /etc/myapp/secrets/db_password</code></pre>
