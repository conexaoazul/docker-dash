---
title: Desktop la distanță (RDP/VNC) pe Linux
summary: Configurează xrdp sau server VNC pe Ubuntu/Debian pentru acces grafic la distanță.
---

<h2>Desktop la distanță (RDP/VNC) pe Linux</h2>
<p>Accesează un desktop grafic pe serverul Linux din Windows, Mac sau altă mașină Linux.</p>

<h3>Opțiunea 1: xrdp (Protocol RDP — prieten cu Windows)</h3>
<pre><code># Instalează un mediu desktop (dacă nu există)
sudo apt install -y xfce4 xfce4-goodies

# Instalează xrdp
sudo apt install -y xrdp
sudo systemctl enable xrdp
sudo systemctl start xrdp

# Configurează xrdp să folosească Xfce
echo xfce4-session > ~/.xsession

# Deschide portul firewall
sudo ufw allow 3389/tcp</code></pre>
<p>Conectare din Windows: deschide <strong>Conexiune Desktop la distanță</strong>, introdu <code>&lt;ip-server&gt;:3389</code>, loghează-te cu utilizatorul și parola Linux.</p>

<h3>Opțiunea 2: TigerVNC Server</h3>
<pre><code>sudo apt install -y tigervnc-standalone-server tigervnc-common

# Setează parola VNC
vncpasswd

# Pornește serverul VNC pe display :1
vncserver :1 -geometry 1920x1080 -depth 24</code></pre>
<p>Conectează-te cu un viewer VNC (RealVNC, TigerVNC Viewer) la <code>&lt;ip-server&gt;:5901</code>.</p>

<h3>Opțiunea 3: x11vnc (Partajează sesiunea X existentă)</h3>
<pre><code>sudo apt install -y x11vnc
x11vnc -display :0 -auth guess -passwd mysecret -forever -bg</code></pre>

<h3>Bune practici de securitate</h3>
<ul>
  <li>Tunelizează RDP/VNC prin SSH în loc să expui porturile direct pe internet</li>
  <li>Folosește parole puternice sau autentificare cu certificat</li>
  <li>Consideră un VPN pentru acces la servere de acasă/birou</li>
</ul>
<pre><code># Tunel SSH pentru VNC (rulează pe client)
ssh -L 5901:localhost:5901 user@server</code></pre>
