---
title: Docker fără root
summary: Rulează Docker daemon fără privilegii root pentru securitate sporită.
---

<h2>Docker fără root (Rootless)</h2>
<p>Modul rootless rulează daemonul Docker și containerele sub un cont de utilizator normal, eliminând riscul ca un container compromis să obțină root pe host.</p>

<h2>Cerințe prealabile</h2>
<pre><code># Instalează pachetele necesare
sudo apt install -y uidmap dbus-user-session slirp4netns

# Verifică că utilizatorul are un interval subuid/subgid
grep $USER /etc/subuid /etc/subgid
# Dacă lipsesc, adaugă:
sudo usermod --add-subuids 100000-165535 --add-subgids 100000-165535 $USER</code></pre>

<h2>Instalează Docker rootless</h2>
<pre><code># Rulează ca utilizator normal (NU root)
dockerd-rootless-setuptool.sh install

# Dacă dockerd-rootless-setuptool.sh nu e găsit, instalează-l:
curl -fsSL https://get.docker.com/rootless | sh</code></pre>

<h2>Configurează shell-ul</h2>
<pre><code># Adaugă în ~/.bashrc sau ~/.zshrc
export PATH=/home/$USER/bin:$PATH
export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock</code></pre>
<pre><code>source ~/.bashrc
docker info   # ar trebui să arate modul rootless</code></pre>

<h2>Pornire automată cu systemd (sesiune utilizator)</h2>
<pre><code>systemctl --user enable docker
systemctl --user start docker
# Pentru pornire chiar fără login:
sudo loginctl enable-linger $USER</code></pre>

<h2>Limitări de reținut</h2>
<ul>
  <li>Porturile sub 1024 necesită <code>sysctl net.ipv4.ip_unprivileged_port_start=80</code>.</li>
  <li><code>--privileged</code> și majoritatea opțiunilor <code>cap_add</code> sunt restricționate.</li>
  <li>Unele drivere de stocare (overlay2) pot necesita configurare suplimentară a kernel-ului.</li>
  <li>Performanța e ușor mai mică din cauza rețelei în modul utilizator (slirp4netns).</li>
</ul>
