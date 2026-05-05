---
title: Samba File Sharing on Linux
summary: Share folders from Linux to Windows/Mac using Samba (SMB/CIFS protocol).
category: linux
difficulty: intermediate
icon: fas fa-folder-open
---

<h2>Samba File Sharing on Linux</h2>
<p>Samba implements the SMB/CIFS protocol, letting you share folders from Linux to Windows, Mac, and other Linux machines — they appear as network drives.</p>

<h3>Install Samba</h3>
<pre><code>sudo apt update
sudo apt install -y samba samba-common-bin</code></pre>

<h3>Create a Share Directory</h3>
<pre><code>sudo mkdir -p /srv/samba/shared
sudo chmod 775 /srv/samba/shared
sudo chown $USER:$USER /srv/samba/shared</code></pre>

<h3>Configure /etc/samba/smb.conf</h3>
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

<h3>Create a Samba User</h3>
<pre><code># User must exist on the system first
sudo useradd -M sambauser
sudo smbpasswd -a sambauser
sudo smbpasswd -e sambauser  # enable the user</code></pre>

<h3>Restart and Enable Samba</h3>
<pre><code>sudo systemctl restart smbd nmbd
sudo systemctl enable smbd nmbd
sudo ufw allow samba</code></pre>

<h3>Connect from Windows</h3>
<p>Open File Explorer, type <code>\&lt;server-ip&gt;Shared</code> in the address bar, enter the Samba credentials when prompted.</p>

<h3>Connect from Linux</h3>
<pre><code>sudo apt install smbclient
smbclient //server-ip/Shared -U sambauser

# Mount as a network drive
sudo mount -t cifs //server-ip/Shared /mnt/share -o username=sambauser</code></pre>
