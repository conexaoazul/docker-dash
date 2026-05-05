---
title: Rootless Docker Setup
summary: Run Docker daemon without root privileges for enhanced security.
category: security
difficulty: advanced
icon: fas fa-user-shield
---

<h2>Rootless Docker Setup</h2>
<p>Rootless mode runs the Docker daemon and containers under a normal user account, eliminating the risk of container escapes gaining root on the host.</p>

<h2>Prerequisites</h2>
<pre><code># Install required packages
sudo apt install -y uidmap dbus-user-session slirp4netns

# Ensure user has a subuid/subgid range
grep $USER /etc/subuid /etc/subgid
# If missing, add:
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 $USER</code></pre>

<h2>Install rootless Docker</h2>
<pre><code># Run as your normal user (NOT root)
dockerd-rootless-setuptool.sh install

# If dockerd-rootless-setuptool.sh is not found, install it:
curl -fsSL https://get.docker.com/rootless | sh</code></pre>

<h2>Configure your shell</h2>
<pre><code># Add to ~/.bashrc or ~/.zshrc
export PATH=/home/$USER/bin:$PATH
export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock</code></pre>
<pre><code>source ~/.bashrc
docker info   # should show rootless mode</code></pre>

<h2>Auto-start with systemd (user session)</h2>
<pre><code>systemctl --user enable docker
systemctl --user start docker
# To start even without login:
sudo loginctl enable-linger $USER</code></pre>

<h2>Limitations to be aware of</h2>
<ul>
  <li>Ports below 1024 require <code>sysctl net.ipv4.ip_unprivileged_port_start=80</code>.</li>
  <li><code>--privileged</code> and most <code>cap_add</code> options are restricted.</li>
  <li>Some storage drivers (overlay2) may need additional kernel config.</li>
  <li>Performance is slightly lower due to user-mode networking (slirp4netns).</li>
</ul>
