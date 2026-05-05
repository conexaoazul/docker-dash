---
title: Gestionarea serviciilor cu Systemd
summary: Pornește, oprește, activează, dezactivează servicii. Vizualizează loguri cu journalctl. Creează unități de serviciu personalizate.
---

<h2>Gestionarea serviciilor cu Systemd</h2>
<p>Systemd este sistemul init și managerul de servicii pe majoritatea distribuțiilor Linux moderne. Stăpânirea câtorva comenzi acoperă marea majoritate a sarcinilor zilnice.</p>

<h3>Comenzi esențiale pentru servicii</h3>
<pre><code>sudo systemctl start nginx       # pornește un serviciu
sudo systemctl stop nginx        # oprește un serviciu
sudo systemctl restart nginx     # oprește apoi pornește
sudo systemctl reload nginx      # reîncarcă config fără oprire

sudo systemctl enable nginx      # pornește la boot
sudo systemctl disable nginx     # nu porni la boot

sudo systemctl status nginx      # verifică starea + loguri recente
sudo systemctl is-active nginx   # active / inactive
sudo systemctl is-enabled nginx  # enabled / disabled</code></pre>

<h3>Vizualizarea logurilor cu journalctl</h3>
<pre><code>journalctl -u nginx              # toate logurile pentru nginx
journalctl -u nginx -f           # urmărire live
journalctl -u nginx --since "1 hour ago"
journalctl -u nginx -n 50        # ultimele 50 de linii
journalctl -p err -u nginx       # doar erori
journalctl --disk-usage          # cât spațiu folosesc logurile</code></pre>

<h3>Creează o unitate de serviciu custom</h3>
<p>Creează <code>/etc/systemd/system/myapp.service</code>:</p>
<pre><code>[Unit]
Description=Aplicatia Mea
After=network.target

[Service]
Type=simple
User=myuser
WorkingDirectory=/opt/myapp
ExecStart=/opt/myapp/myapp --port 8080
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target</code></pre>
<pre><code>sudo systemctl daemon-reload        # reîncarcă fișierele de unitate
sudo systemctl enable --now myapp   # activează și pornește imediat</code></pre>

<h3>Unități Timer (înlocuitor pentru Cron)</h3>
<p>Creează <code>/etc/systemd/system/backup.timer</code>:</p>
<pre><code>[Unit]
Description=Timer backup zilnic

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target</code></pre>
<pre><code>sudo systemctl enable --now backup.timer
systemctl list-timers  # listează toți timerii activi</code></pre>
