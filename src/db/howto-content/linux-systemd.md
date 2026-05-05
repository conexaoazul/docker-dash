---
title: Systemd Service Management
summary: Start, stop, enable, disable services. View logs with journalctl. Create custom service units.
category: linux
difficulty: beginner
icon: fas fa-cogs
---

<h2>Systemd Service Management</h2>
<p>Systemd is the init system and service manager on most modern Linux distributions. Mastering a handful of commands covers the vast majority of daily tasks.</p>

<h3>Essential Service Commands</h3>
<pre><code>sudo systemctl start nginx       # start a service
sudo systemctl stop nginx        # stop a service
sudo systemctl restart nginx     # stop then start
sudo systemctl reload nginx      # reload config without stopping

sudo systemctl enable nginx      # start on boot
sudo systemctl disable nginx     # don't start on boot

sudo systemctl status nginx      # check status + recent logs
sudo systemctl is-active nginx   # active / inactive
sudo systemctl is-enabled nginx  # enabled / disabled</code></pre>

<h3>Viewing Logs with journalctl</h3>
<pre><code>journalctl -u nginx              # all logs for nginx
journalctl -u nginx -f           # follow (live tail)
journalctl -u nginx --since "1 hour ago"
journalctl -u nginx -n 50        # last 50 lines
journalctl -p err -u nginx       # errors only
journalctl --disk-usage          # how much space logs use</code></pre>

<h3>Create a Custom Service Unit</h3>
<p>Create <code>/etc/systemd/system/myapp.service</code>:</p>
<pre><code>[Unit]
Description=My Application
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
<pre><code>sudo systemctl daemon-reload      # reload unit files
sudo systemctl enable --now myapp # enable and start immediately</code></pre>

<h3>Timer Units (Cron Replacement)</h3>
<p>Create <code>/etc/systemd/system/backup.timer</code>:</p>
<pre><code>[Unit]
Description=Daily Backup Timer

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target</code></pre>
<pre><code>sudo systemctl enable --now backup.timer
systemctl list-timers  # list all active timers</code></pre>
