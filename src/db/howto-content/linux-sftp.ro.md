---
title: Configurare server SFTP
summary: Configurează un server SFTP securizat pentru transferuri de fișiere folosind OpenSSH.
---

<h2>Configurare server SFTP</h2>
<p>SFTP (SSH File Transfer Protocol) este inclus în OpenSSH — nu necesită software suplimentar. Este cea mai sigură modalitate de transfer de fișiere către/de pe un server Linux.</p>

<h3>OpenSSH include deja SFTP</h3>
<pre><code># Verifică dacă SSH rulează
sudo systemctl status sshd

# Testează SFTP (probabil ești deja gata!)
sftp username@server</code></pre>

<h3>Creează un utilizator dedicat doar pentru SFTP</h3>
<pre><code># Creează utilizator fără shell de login
sudo useradd -m -s /usr/sbin/nologin sftpuser
sudo passwd sftpuser

# Creează directorul de upload
sudo mkdir -p /home/sftpuser/uploads
sudo chown sftpuser:sftpuser /home/sftpuser/uploads</code></pre>

<h3>Chroot Jail (restricționează utilizatorul la directorul home)</h3>
<p>Adaugă la sfârșitul fișierului <code>/etc/ssh/sshd_config</code>:</p>
<pre><code>Match User sftpuser
    ForceCommand internal-sftp
    ChrootDirectory /home/sftpuser
    PasswordAuthentication yes
    AllowTcpForwarding no
    X11Forwarding no</code></pre>
<pre><code>sudo systemctl restart sshd</code></pre>
<p><strong>Notă:</strong> Directorul chroot trebuie să fie deținut de <code>root</code>:</p>
<pre><code>sudo chown root:root /home/sftpuser</code></pre>

<h3>Conectare cu comanda sftp</h3>
<pre><code>sftp sftpuser@server
sftp> ls
sftp> put fisier-local.txt
sftp> get fisier-remote.txt
sftp> exit</code></pre>

<h3>Conectare cu FileZilla</h3>
<p>Host: <code>sftp://ip-server</code>, Port: <code>22</code>, Protocol: SFTP, utilizator/parolă conform celor setate. FileZilla suportă atât autentificarea cu parolă, cât și cu cheie.</p>
