---
title: Partajare fișiere Samba pe Linux
summary: Partajează foldere din Linux către Windows/Mac folosind Samba (protocol SMB/CIFS).
---

<h2>Partajare fișiere Samba pe Linux</h2>
<p>Samba implementează protocolul SMB/CIFS, permițându-ți să partajezi foldere din Linux către Windows, Mac și alte mașini Linux — apar ca unități de rețea.</p>

<h3>Instalează Samba</h3>
<pre><code>sudo apt update
sudo apt install -y samba samba-common-bin</code></pre>

<h3>Creează un director de partajare</h3>
<pre><code>sudo mkdir -p /srv/samba/shared
sudo chmod 775 /srv/samba/shared
sudo chown $USER:$USER /srv/samba/shared</code></pre>

<h3>Configurează /etc/samba/smb.conf</h3>
<pre><code>[global]
   workgroup = WORKGROUP
   server string = My Linux Server
   security = user
   map to guest = bad user

[Shared]
   path = /srv/samba/shared
   browseable = yes
   read only = no
   valid users = sambauser
   create mask = 0664
   directory mask = 0775</code></pre>

<h3>Creează un utilizator Samba</h3>
<pre><code># Utilizatorul trebuie să existe mai întâi în sistem
sudo useradd -M sambauser
sudo smbpasswd -a sambauser
sudo smbpasswd -e sambauser  # activează utilizatorul</code></pre>

<h3>Repornește și activează Samba</h3>
<pre><code>sudo systemctl restart smbd nmbd
sudo systemctl enable smbd nmbd
sudo ufw allow samba</code></pre>

<h3>Conectare din Windows</h3>
<p>Deschide File Explorer, tastează <code>\&lt;ip-server&gt;Shared</code> în bara de adrese, introdu credențialele Samba când ești solicitat.</p>

<h3>Conectare din Linux</h3>
<pre><code>sudo apt install smbclient
smbclient //ip-server/Shared -U sambauser

# Montează ca unitate de rețea
sudo mount -t cifs //ip-server/Shared /mnt/share -o username=sambauser</code></pre>
