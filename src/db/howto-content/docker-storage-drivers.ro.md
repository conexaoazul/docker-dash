---
title: Drivere de stocare Docker
summary: Înțelege driverele de stocare overlay2, btrfs, zfs și caracteristicile lor de performanță.
---

<h2>Drivere de stocare Docker</h2>
<p>Driverele de stocare gestionează modul în care layerele imaginilor sunt stocate și stivuite pe disc. Alegerea afectează performanța, stabilitatea și funcționalitățile disponibile.</p>

<h3>Verifică driverul curent</h3>
<pre><code>docker info | grep "Storage Driver"</code></pre>

<h3>overlay2 — Alegerea implicită și recomandată</h3>
<p>Funcționează pe orice kernel Linux 4.0+ cu sisteme de fișiere ext4 sau xfs. Folosește OverlayFS din Linux pentru a stiva eficient layerele imaginilor. Cea mai bună performanță pentru majoritatea sarcinilor.</p>
<ul>
  <li>Suportat pe: Ubuntu, Debian, CentOS 8+, Fedora, RHEL 8+</li>
  <li>Necesită: <code>d_type=true</code> pe XFS (verifică cu <code>xfs_info / | grep ftype</code>)</li>
</ul>

<h3>btrfs</h3>
<p>Folosește snapshot-urile native ale sistemului de fișiere Btrfs. Performanță bună pentru sarcini cu scrieri intense. Necesită ca sistemul de fișiere al hostului să fie Btrfs.</p>

<h3>zfs</h3>
<p>Folosește snapshot-urile native ZFS și send/receive. Excelent pentru integritatea datelor și deduplicare. Utilizare mai mare a memoriei față de overlay2.</p>

<h3>devicemapper (Legacy — Evită)</h3>
<p>Driver mai vechi, depreciat în Docker 20.10+. Performanță slabă în modul loopback. Evită pe instalările noi.</p>

<h3>Când să schimbi driverele de stocare</h3>
<ul>
  <li><strong>Rămâi pe overlay2</strong> pentru marea majoritate a cazurilor de utilizare</li>
  <li><strong>Consideră btrfs/zfs</strong> doar dacă hostul tău rulează deja acele sisteme de fișiere</li>
  <li>Schimbarea driverelor de stocare necesită ștergerea tuturor imaginilor și containerelor existente</li>
</ul>
