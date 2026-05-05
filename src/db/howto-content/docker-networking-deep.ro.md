---
title: Rețele Docker în detaliu
summary: Înțelege rețelele bridge, host, overlay, macvlan și când să le folosești.
---

<h2>Rețele Docker în detaliu</h2>
<p>Docker oferă cinci drivere de rețea. Înțelegerea modului de funcționare al fiecăruia te ajută să alegi pe cel potrivit și să depanezi problemele de conectivitate.</p>

<h3>Bridge (implicit)</h3>
<p>Fiecare container primește o interfață Ethernet virtuală (pereche veth). Un capăt trăiește în container, celălalt în namespace-ul de rețea al hostului. Docker creează reguli <code>iptables</code> pentru NAT și redirecționarea porturilor.</p>
<pre><code>docker network create mynet
docker run --network mynet myapp</code></pre>
<p>Containerele din aceeași rețea bridge custom se pot contacta reciproc prin numele containerului (DNS integrat).</p>

<h3>Rețea Host</h3>
<p>Containerul împarte namespace-ul de rețea al hostului — fără izolare, fără NAT, performanță maximă.</p>
<pre><code>docker run --network host nginx</code></pre>
<p>Folosește când: latența scăzută este critică (proxy-uri de throughput ridicat, agenți de monitorizare).</p>

<h3>Overlay (Swarm Multi-Host)</h3>
<p>Rețelele overlay se extind pe mai mulți hosturi Docker folosind încapsulare VXLAN. Serviciile Swarm din aceeași rețea overlay pot comunica prin numele serviciului indiferent de nodul pe care rulează.</p>
<pre><code>docker network create -d overlay --attachable myoverlay</code></pre>

<h3>Macvlan</h3>
<p>Atribuie o adresă MAC reală containerului, făcându-l să apară ca un dispozitiv fizic în rețeaua LAN. Containerele obțin propriile adrese IP din pool-ul DHCP al router-ului.</p>
<pre><code>docker network create -d macvlan \
  --subnet=192.168.1.0/24 \
  --gateway=192.168.1.1 \
  -o parent=eth0 mymacvlan</code></pre>

<h3>None</h3>
<p>Dezactivează complet rețeaua. Folosește pentru containere de procesare în lot care nu trebuie să aibă acces la rețea.</p>
