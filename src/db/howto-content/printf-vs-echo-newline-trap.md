---
title: printf vs echo — The Newline Trap
summary: Why echo silently corrupts secrets and credentials, and the one-line fix that prevents hours of debugging.
category: troubleshooting
difficulty: beginner
icon: fas fa-exclamation-triangle
---

<h2>The Problem in 30 Seconds</h2>
<pre><code>echo "my-password" > /etc/myapp/secrets/db_password
# File contents: my-password\n   ← newline appended!
# Database driver tries to authenticate with "my-password\n"
# Result: silent auth failure</code></pre>

<h2>Why echo Adds a Newline</h2>
<p>POSIX <code>echo</code> appends <code>\n</code> by default. This makes sense for terminal output (each line ends with newline), but breaks when you're writing exact byte-perfect data like passwords, API keys, or TLS certs.</p>

<h2>The Fix: printf %s</h2>
<pre><code># RIGHT: printf does NOT add newline
printf '%s' "my-password" > /etc/myapp/secrets/db_password

# Verify (no trailing $ on second line means no newline):
cat /etc/myapp/secrets/db_password | xxd | tail -2</code></pre>

<h2>Real-World Failures This Prevents</h2>
<ul>
  <li><strong>tedious (MSSQL Node driver):</strong> includes the newline in the password string, returns "Login failed for user".</li>
  <li><strong>libssh:</strong> private key parsing fails because of trailing newline → "no matching authentication method".</li>
  <li><strong>JWT keys:</strong> signature verification fails because the key bytes don't match.</li>
  <li><strong>API tokens in headers:</strong> server sees <code>Authorization: Bearer abc123\n</code> and rejects it.</li>
</ul>

<h2>Common Variants to Avoid</h2>
<pre><code># BAD — all add newline:
echo "secret" > file
echo -n "secret" > file       # -n is not portable; busybox echo ignores it
"$VAR" > file                  # bash: appends newline
cat &lt;&lt;&lt; "secret" > file        # here-string also adds newline

# GOOD:
printf '%s' "secret" > file
print -n "secret" > file       # zsh/ksh only
echo -E -n "secret" > file     # bash with explicit flags (still risky)</code></pre>

<h2>The Quote Pattern (for command substitution)</h2>
<pre><code># Inside subshells, always wrap in printf:
sudo sh -c 'printf "%s" "$(openssl rand -base64 24)" > /etc/secrets/key'

# NOT this:
sudo sh -c 'echo "$(openssl rand -base64 24)" > /etc/secrets/key'  # adds newline</code></pre>

<h2>Detecting Existing Damage</h2>
<pre><code># Find secret files that have a trailing newline (last byte is 0x0a):
for f in /etc/myapp/secrets/*; do
  if [ "$(tail -c 1 "$f" | xxd -p)" = "0a" ]; then
    echo "TRAILING NEWLINE: $f"
  fi
done

# Fix in place (strip trailing newline):
truncate -s -1 /etc/myapp/secrets/db_password</code></pre>

<h2>The One-Line Audit Tool</h2>
<pre><code># In your CI/pre-deploy script:
find /etc/myapp/secrets -type f -exec sh -c \
  'tail -c 1 "$1" | grep -q $"\n" && echo "BAD: $1"' _ {} \;</code></pre>
