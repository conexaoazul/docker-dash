---
title: SFTP Server Setup
summary: Set up a secure SFTP server for file transfers using OpenSSH.
category: linux
difficulty: beginner
icon: fas fa-upload
---

<h2>SFTP Server Setup</h2>
<p>SFTP (SSH File Transfer Protocol) is built into OpenSSH — no extra software needed. It's the most secure way to transfer files to/from a Linux server.</p>

<h3>OpenSSH Already Includes SFTP</h3>
<pre><code># Check if SSH is running
sudo systemctl status sshd

# Test SFTP (you're probably already done!)
sftp username@server</code></pre>

<h3>Create a Dedicated SFTP-Only User</h3>
<pre><code># Create user with no login shell
sudo useradd -m -s /usr/sbin/nologin sftpuser
sudo passwd sftpuser

# Create upload directory
sudo mkdir -p /home/sftpuser/uploads
sudo chown sftpuser:sftpuser /home/sftpuser/uploads</code></pre>

<h3>Chroot Jail (Restrict User to Home Directory)</h3>
<p>Add to the bottom of <code>/etc/ssh/sshd_config</code>:</p>
<pre><code>Match User sftpuser
    ForceCommand internal-sftp
    ChrootDirectory /home/sftpuser
    PasswordAuthentication yes
    AllowTcpForwarding no
    X11Forwarding no</code></pre>
<pre><code>sudo systemctl restart sshd</code></pre>
<p><strong>Note:</strong> The chroot directory must be owned by <code>root</code>:</p>
<pre><code>sudo chown root:root /home/sftpuser</code></pre>

<h3>Connect with sftp Command</h3>
<pre><code>sftp sftpuser@server
sftp> ls
sftp> put localfile.txt
sftp> get remotefile.txt
sftp> exit</code></pre>

<h3>Connect with FileZilla</h3>
<p>Host: <code>sftp://server-ip</code>, Port: <code>22</code>, Protocol: SFTP, User/Password as set above. FileZilla supports both password and key-based authentication.</p>
