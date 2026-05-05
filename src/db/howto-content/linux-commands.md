---
title: Essential Linux Commands
summary: '20 essential Linux commands every Docker user should know: files, processes, networking.'
category: linux
difficulty: beginner
icon: fas fa-terminal
---

<h2>Essential Linux Commands</h2>
<p>These 20 commands cover the operations you'll use daily when managing a Docker host.</p>

<h2>File system</h2>
<pre><code>ls -lah            # List files with sizes (human-readable)
cd /var/log        # Change directory
pwd                # Print current directory
cp file1 file2     # Copy file
mv old new         # Move / rename file
rm -rf dir/        # Delete file or directory (careful with -rf!)
mkdir -p a/b/c     # Create nested directories
cat file.txt       # Print file contents
less file.txt      # Scroll through file (q to quit)</code></pre>

<h2>Processes</h2>
<pre><code>ps aux             # List all running processes
top                # Live process monitor (q to quit)
htop               # Better top (install: apt install htop)
kill -9 1234       # Force-kill process with PID 1234
pkill nginx        # Kill by process name</code></pre>

<h2>Networking</h2>
<pre><code>ip addr            # Show network interfaces and IPs
ss -tlnp           # Show listening TCP sockets with PIDs
curl -I https://example.com   # HTTP headers only
ping -c 4 8.8.8.8  # Test reachability</code></pre>

<h2>Disk &amp; memory</h2>
<pre><code>df -h              # Disk usage per filesystem
du -sh /var/lib/docker   # Size of a specific directory
free -h            # RAM and swap usage
uname -r           # Kernel version</code></pre>

<h3>Tips</h3>
<ul>
  <li>Prefix any command with <code>sudo</code> to run as root.</li>
  <li>Press <strong>Ctrl+C</strong> to interrupt a running command.</li>
  <li>Use <code>man &lt;command&gt;</code> (e.g. <code>man ls</code>) to read the manual.</li>
  <li>Append <code>| grep word</code> to filter output, e.g. <code>ps aux | grep nginx</code>.</li>
</ul>
