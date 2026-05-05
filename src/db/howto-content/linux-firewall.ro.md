---
title: Firewall Linux (UFW/iptables)
summary: Configurează reguli de firewall UFW sau iptables. Înțelege problema de bypass Docker/UFW.
---

<h2>Firewall Linux (UFW/iptables)</h2>
<p>UFW (Uncomplicated Firewall) este front-end-ul recomandat pentru iptables pe Ubuntu/Debian. Totuși, Docker are o problemă de bypass cunoscută pe care trebuie să o înțelegi înainte de a te baza doar pe UFW.</p>

<h3>Configurare de bază UFW</h3>
<pre><code># Activează UFW
sudo ufw enable

# Implicit: refuză tot incoming, permite tot outgoing
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Permite SSH (fă asta ÎNAINTE de a activa UFW!)
sudo ufw allow ssh
sudo ufw allow 22/tcp

# Permite porturi specifice
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3000/tcp

# Verifică starea
sudo ufw status verbose

# Șterge o regulă
sudo ufw delete allow 3000/tcp</code></pre>

<h3>Problema bypass Docker/UFW</h3>
<p><strong>Critic:</strong> Docker modifică iptables direct și ocolește regulile UFW pentru porturile publicate. Un container cu <code>-p 8080:8080</code> este expus pe internet chiar dacă UFW blochează portul 8080!</p>

<h3>Remediere: Folosește lanțul DOCKER-USER</h3>
<p>Adaugă reguli la lanțul iptables <code>DOCKER-USER</code> — Docker le citește, dar UFW nu le suprascrie:</p>
<pre><code># Blochează accesul la porturile Docker cu excepția unui IP de încredere
sudo iptables -I DOCKER-USER -i eth0 ! -s 192.168.1.0/24 -j DROP

# Salvează regulile iptables
sudo apt install -y iptables-persistent
sudo netfilter-persistent save</code></pre>

<h3>Remediere alternativă: Leagă la localhost</h3>
<pre><code># În docker-compose.yml — accesibil doar de pe host
ports:
  - "127.0.0.1:8080:8080"</code></pre>
<p>Apoi folosește un reverse proxy (Nginx/Traefik) pentru traficul extern.</p>
