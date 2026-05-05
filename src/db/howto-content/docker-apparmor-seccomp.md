---
title: AppArmor & Seccomp Profiles
summary: Restrict container syscalls with seccomp and filesystem access with AppArmor profiles.
category: security
difficulty: advanced
icon: fas fa-shield-alt
---

<h2>AppArmor &amp; Seccomp Profiles</h2>
<p>Seccomp and AppArmor are Linux kernel security mechanisms that limit what containers can do — even if they are running as root.</p>

<h3>Seccomp — Restricting System Calls</h3>
<p>Docker applies a <strong>default seccomp profile</strong> that blocks ~44 dangerous syscalls (e.g., <code>ptrace</code>, <code>mount</code>, <code>kexec_load</code>). This works automatically without configuration.</p>

<pre><code># Verify seccomp is active
docker info | grep seccomp

# Run with no seccomp (avoid in production)
docker run --security-opt seccomp=unconfined myapp

# Run with a custom profile
docker run --security-opt seccomp=/path/to/profile.json myapp</code></pre>

<h3>Creating a Custom Seccomp Profile</h3>
<pre><code>{
  "defaultAction": "SCMP_ACT_ERRNO",
  "syscalls": [
    {
      "names": ["read", "write", "open", "close", "stat", "exit", "exit_group"],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}</code></pre>
<p>Start with the default Docker profile from GitHub and remove only what your app doesn't need.</p>

<h3>AppArmor — Restricting File System Access</h3>
<p>Docker uses the <code>docker-default</code> AppArmor profile automatically on supported systems.</p>
<pre><code># Check if AppArmor is active
aa-status

# Run with a custom profile
docker run --security-opt apparmor=my-profile myapp

# Run without AppArmor (avoid)
docker run --security-opt apparmor=unconfined myapp</code></pre>

<h3>Key --security-opt Flags</h3>
<pre><code>--security-opt no-new-privileges    # prevents privilege escalation
--security-opt seccomp=profile.json # custom syscall filter
--security-opt apparmor=myprofile   # custom AppArmor policy
--cap-drop ALL --cap-add NET_BIND_SERVICE  # drop all, add only what's needed</code></pre>
