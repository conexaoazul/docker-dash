---
title: Cum instalezi Docker
summary: Instalează Docker Engine pe Ubuntu, Debian, CentOS sau Alpine cu comenzi pas cu pas.
---

<h2>Instalare Docker pe Ubuntu / Debian</h2>
<p>Metoda recomandată este să adaugi repository-ul APT oficial Docker pentru a primi întotdeauna ultima versiune stabilă.</p>
<pre><code># Elimină pachetele vechi conflictuale
sudo apt-get remove -y docker docker-engine docker.io containerd runc

# Instalează dependențele necesare
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# Adaugă cheia GPG Docker
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg   | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Adaugă repository-ul
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg]   https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable"   | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Instalează Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin</code></pre>

<h3>Verifică instalarea</h3>
<pre><code>sudo docker run hello-world</code></pre>
<p>Ar trebui să vezi mesajul "Hello from Docker!". Pentru a rula Docker fără <code>sudo</code>, adaugă utilizatorul în grupul docker:</p>
<pre><code>sudo usermod -aG docker $USER
# Deconectează-te și reconectează-te, apoi testează:
docker run hello-world</code></pre>

<h2>CentOS / RHEL / Fedora</h2>
<pre><code>sudo dnf install -y yum-utils
sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker</code></pre>

<h2>Alpine Linux</h2>
<pre><code>apk add docker docker-compose
rc-update add docker default
service docker start</code></pre>
