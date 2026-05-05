---
title: Profile AppArmor și Seccomp
summary: Restricționează apelurile de sistem ale containerelor cu seccomp și accesul la sistem de fișiere cu profile AppArmor.
---

<h2>Profile AppArmor și Seccomp</h2>
<p>Seccomp și AppArmor sunt mecanisme de securitate ale kernel-ului Linux care limitează ce pot face containerele — chiar dacă rulează ca root.</p>

<h3>Seccomp — Restricționarea apelurilor de sistem</h3>
<p>Docker aplică un <strong>profil seccomp implicit</strong> care blochează ~44 syscall-uri periculoase (ex. <code>ptrace</code>, <code>mount</code>, <code>kexec_load</code>). Funcționează automat fără configurare.</p>

<pre><code># Verifică dacă seccomp este activ
docker info | grep seccomp

# Rulează fără seccomp (evită în producție)
docker run --security-opt seccomp=unconfined myapp

# Rulează cu un profil custom
docker run --security-opt seccomp=/path/to/profile.json myapp</code></pre>

<h3>Crearea unui profil seccomp custom</h3>
<pre><code>{
  "defaultAction": "SCMP_ACT_ERRNO",
  "syscalls": [
    {
      "names": ["read", "write", "open", "close", "stat", "exit", "exit_group"],
      "action": "SCMP_ACT_ALLOW"
    }
  ]
}</code></pre>
<p>Începe cu profilul Docker implicit de pe GitHub și elimină doar ce aplicația ta nu are nevoie.</p>

<h3>AppArmor — Restricționarea accesului la sistemul de fișiere</h3>
<p>Docker folosește automat profilul AppArmor <code>docker-default</code> pe sistemele suportate.</p>
<pre><code># Verifică dacă AppArmor este activ
aa-status

# Rulează cu un profil custom
docker run --security-opt apparmor=my-profile myapp</code></pre>

<h3>Flag-uri cheie --security-opt</h3>
<pre><code>--security-opt no-new-privileges    # previne escalarea privilegiilor
--security-opt seccomp=profile.json # filtru custom de syscall
--security-opt apparmor=myprofile   # politică AppArmor custom
--cap-drop ALL --cap-add NET_BIND_SERVICE  # elimină toate, adaugă doar ce e necesar</code></pre>
