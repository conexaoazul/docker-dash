---
title: How to Install Docker
summary: Install Docker Engine on Ubuntu, Debian, CentOS, or Alpine with step-by-step commands.
category: basics
difficulty: beginner
icon: fab fa-docker
---

<h2>Install Docker on Ubuntu / Debian</h2>
<p>The recommended way is to add Docker's official APT repository so you always get the latest stable engine.</p>
<pre><code># Remove old conflicting packages (safe to run even if not installed)
sudo apt-get remove -y docker docker-engine docker.io containerd runc

# Install prerequisites
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# Add Docker's GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg   | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg]   https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable"   | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin</code></pre>

<h3>Verify the installation</h3>
<pre><code>sudo docker run hello-world</code></pre>
<p>You should see a "Hello from Docker!" message. To run Docker without <code>sudo</code>, add your user to the docker group:</p>
<pre><code>sudo usermod -aG docker $USER
# Log out and back in, then test:
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
