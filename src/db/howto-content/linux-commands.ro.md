---
title: Comenzi Linux esențiale
summary: 20 comenzi Linux esențiale pe care orice utilizator Docker trebuie să le cunoască.
---

<h2>Comenzi Linux esențiale</h2>
<p>Aceste 20 de comenzi acoperă operațiunile pe care le vei folosi zilnic când administrezi un host Docker.</p>

<h2>Sistemul de fișiere</h2>
<pre><code>ls -lah            # Listează fișierele cu dimensiuni (human-readable)
cd /var/log        # Schimbă directorul
pwd                # Afișează directorul curent
cp file1 file2     # Copiază fișier
mv old new         # Mută / redenumește fișier
rm -rf dir/        # Șterge fișier sau director (atenție la -rf!)
mkdir -p a/b/c     # Creează directoare imbricate
cat file.txt       # Afișează conținutul fișierului
less file.txt      # Navighează prin fișier (q pentru ieșire)</code></pre>

<h2>Procese</h2>
<pre><code>ps aux             # Listează toate procesele active
top                # Monitor live de procese (q pentru ieșire)
htop               # Top îmbunătățit (instalare: apt install htop)
kill -9 1234       # Forțează oprirea procesului cu PID 1234
pkill nginx        # Oprește după numele procesului</code></pre>

<h2>Rețea</h2>
<pre><code>ip addr            # Arată interfețele de rețea și IP-urile
ss -tlnp           # Arată socket-uri TCP care ascultă, cu PID-uri
curl -I https://example.com   # Doar anteturile HTTP
ping -c 4 8.8.8.8  # Testează conectivitatea</code></pre>

<h2>Disc și memorie</h2>
<pre><code>df -h              # Utilizarea discului pe sistem de fișiere
du -sh /var/lib/docker   # Dimensiunea unui director specific
free -h            # Utilizarea RAM și swap
uname -r           # Versiunea kernel-ului</code></pre>

<h3>Sfaturi</h3>
<ul>
  <li>Prefixează orice comandă cu <code>sudo</code> pentru a rula ca root.</li>
  <li>Apasă <strong>Ctrl+C</strong> pentru a întrerupe o comandă în execuție.</li>
  <li>Folosește <code>man &lt;comandă&gt;</code> (ex. <code>man ls</code>) pentru a citi manualul.</li>
  <li>Adaugă <code>| grep cuvant</code> pentru a filtra rezultatele, ex. <code>ps aux | grep nginx</code>.</li>
</ul>
