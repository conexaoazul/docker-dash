---
title: Remote Desktop (RDP/VNC) on Linux
summary: Set up xrdp or VNC server on Ubuntu/Debian for remote graphical access.
category: linux
difficulty: intermediate
icon: fas fa-desktop
---

<h2>Remote Desktop (RDP/VNC) on Linux</h2>
<p>Access a graphical desktop on your Linux server from Windows, Mac, or another Linux machine.</p>

<h3>Option 1: xrdp (RDP Protocol — Windows-Friendly)</h3>
<pre><code># Install a desktop environment (if none installed)
sudo apt install -y xfce4 xfce4-goodies

# Install xrdp
sudo apt install -y xrdp
sudo systemctl enable xrdp
sudo systemctl start xrdp

# Configure xrdp to use Xfce
echo xfce4-session > ~/.xsession

# Open firewall port
sudo ufw allow 3389/tcp</code></pre>
<p>Connect from Windows: open <strong>Remote Desktop Connection</strong>, enter <code>&lt;server-ip&gt;:3389</code>, log in with your Linux username and password.</p>

<h3>Option 2: TigerVNC Server</h3>
<pre><code>sudo apt install -y tigervnc-standalone-server tigervnc-common

# Set VNC password
vncpasswd

# Start VNC server on display :1
vncserver :1 -geometry 1920x1080 -depth 24

# View VNC logs
cat ~/.vnc/*.log</code></pre>
<p>Connect with a VNC viewer (RealVNC, TigerVNC Viewer) to <code>&lt;server-ip&gt;:5901</code>.</p>

<h3>Option 3: x11vnc (Share Existing X Session)</h3>
<pre><code>sudo apt install -y x11vnc
x11vnc -display :0 -auth guess -passwd mysecret -forever -bg</code></pre>

<h3>Security Best Practices</h3>
<ul>
  <li>Tunnel RDP/VNC over SSH instead of exposing ports directly to the internet</li>
  <li>Use strong passwords or certificate authentication</li>
  <li>Consider a VPN for access to home/office servers</li>
</ul>
<pre><code># SSH tunnel for VNC (run on client)
ssh -L 5901:localhost:5901 user@server</code></pre>
