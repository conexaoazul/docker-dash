---
title: Auditează postura de rețea outbound a containerelor
summary: Vezi ce containere pot ajunge la internetul public și la endpoint-urile cloud-metadata (IMDS). Identifică riscurile de furt de credențiale dintr-un container compromis. Read-only — enforcement-ul vine în v6.7.
---

<h2>Ce arată auditul</h2>
<p>Mergi la <strong>Sistem → Egress</strong>. Pentru fiecare container de pe host vezi:</p>
<ul>
  <li><strong>Network mode</strong> — <code>bridge</code> (default), <code>host</code> (fără izolare), <code>none</code> (complet izolat), <code>container:&lt;id&gt;</code> (împarte stack-ul de rețea cu alt container), sau o rețea definită de utilizator.</li>
  <li><strong>Rețele atașate</strong> cu un badge pentru fiecare: <code>[internal]</code> (sigur — <code>--internal: true</code>, fără outbound), <code>[bridge]</code> (rutează outbound), sau numele driver-ului.</li>
  <li><strong>Reachability</strong> — "Isolated" / "Internet" / "Internet + IMDS".</li>
  <li><strong>Score</strong> (0-100) și un badge <strong>Risc</strong> (critical / warning / info).</li>
</ul>
<p>Click pe un rând ca să expandezi lista completă de findings, entry-urile extra_hosts și DNS-ul custom.</p>

<h2>De ce contează IMDS</h2>
<p>Providerii de cloud rulează un serviciu de metadata la <code>169.254.169.254</code> (AWS, Azure, GCP) sau <code>metadata.google.internal</code>. Când un container poate ajunge acolo și a fost compromis (RCE, SSRF, supply-chain), atacatorul poate citi <strong>credențiale IAM role</strong> și pivota în contul de cloud. Blocarea acestui singur IP la nivelul containerului elimină cea mai comună cale de breakout din cloud.</p>

<h2>Ce se flaghează</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Severitate</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Condiție</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Impact</th></tr>
<tr><td style="padding:6px"><span style="color:#ef4444"><strong>critical</strong></span></td><td style="padding:6px"><code>network_mode: host</code></td><td style="padding:6px">Fără nicio izolare de rețea — containerul împarte namespace-ul de rețea al host-ului.</td></tr>
<tr><td style="padding:6px"><span style="color:#ef4444"><strong>critical</strong></span></td><td style="padding:6px"><code>extra_hosts</code> pointează un nume la un IP IMDS</td><td style="padding:6px">Reach IMDS explicit, intenționat — aproape niciodată ce vrei.</td></tr>
<tr><td style="padding:6px"><span style="color:#f59e0b"><strong>warning</strong></span></td><td style="padding:6px">Orice rețea bridge non-internal</td><td style="padding:6px">Containerul poate ajunge la internet + IMDS. OK pentru aplicații care au nevoie, risc pentru cele care nu.</td></tr>
<tr><td style="padding:6px"><span style="color:#f59e0b"><strong>warning</strong></span></td><td style="padding:6px">Capability <code>NET_ADMIN</code> sau <code>NET_RAW</code></td><td style="padding:6px">Containerul poate modifica iptables-ul host-ului / forgea pachete. Scoate dacă nu e un VPN / proxy.</td></tr>
<tr><td style="padding:6px"><span style="color:#64748b"><strong>info</strong></span></td><td style="padding:6px">DNS custom configurat</td><td style="padding:6px">Merită un look — DNS e un canal C2 comun.</td></tr>
</table>

<h2>Cum să mitighezi (rețete compose)</h2>

<h3>1. Izolare completă (fără outbound)</h3>
<p>Pentru job-uri care nu au nevoie de outbound — workeri batch, script-uri one-shot, baze de date accesate doar de alte containere:</p>
<pre><code>services:
  my-db:
    image: postgres:16
    network_mode: none        # opțiune nucleară, sau:
    networks: [internal-net]  # opțiunea per-network (mai jos)

networks:
  internal-net:
    driver: bridge
    internal: true            # &lt;&mdash; flag-ul cheie
</code></pre>

<h3>2. Rețele în tiere (app tier ajunge la internet, DB tier nu)</h3>
<pre><code>services:
  web:
    networks: [public, db]    # poate ajunge la internet + db
  api:
    networks: [public, db]
  db:
    networks: [db]            # fără outbound — doar db tier

networks:
  public:
    driver: bridge
  db:
    driver: bridge
    internal: true            # blochează outbound pentru orice e pe acest net
</code></pre>

<h3>3. Blochează doar IMDS (iptables la nivel de host)</h3>
<p>Dacă nu poți restructura rețelele, blochează IMDS la nivelul host-ului. Pe host-ul Docker:</p>
<pre><code>iptables -I DOCKER-USER -d 169.254.169.254 -j DROP
iptables -I DOCKER-USER -d 169.254.170.2 -j DROP  # ECS task role</code></pre>
<p>Persistă cu <code>iptables-persistent</code> / <code>nftables</code>. Testează dintr-un container: <code>docker run --rm alpine wget -T5 -q -O- 169.254.169.254</code> ar trebui să eșueze.</p>

<h2>Ce înseamnă score-ul</h2>
<ul>
  <li><strong>100</strong> — toate rețelele internal sau <code>network_mode: none</code>.</li>
  <li><strong>80–99</strong> — aplicație multi-net tipică cu doar findings info-level.</li>
  <li><strong>60–79</strong> — un warning (ex: internet + IMDS reachable fără alternativă izolată).</li>
  <li><strong>&lt;60</strong> — findings critice (<code>host</code> mode, IMDS pin via extra_hosts, mai multe probleme suprapuse).</li>
</ul>

<h2>Ce NU face acest audit (încă)</h2>
<ul>
  <li><strong>Fără enforcement.</strong> E un tool de vizibilitate. Blocarea traficului outbound e planificată pentru v6.7 (UI whitelist + sidecar squid opțional + reguli iptables per container).</li>
  <li><strong>Fără probe live.</strong> Analiza se bazează pe config-ul Docker (network inspect + HostConfig). O regulă iptables la nivel de host care dă drop la 169.254.169.254 NU e detectată — containerele pe un bridge non-internal vor rămâne flagate ca "IMDS reachable" chiar dacă ai blocat la host. Folosește <code>docker run --rm alpine wget -T2 -q -O- 169.254.169.254</code> ca să confirmi blocarea efectivă.</li>
  <li><strong>Fără recomandări per container.</strong> Sugestiile de fix sunt generice. Folosește Container Remediation Wizard (v6.6.0) pentru hardening individual.</li>
</ul>

<h2>Cum se leagă cu celelalte audituri</h2>
<ul>
  <li><strong>Secrets Audit</strong> — găsește secrete plain-text în container. Egress Audit găsește căile prin care să iasă afară.</li>
  <li><strong>CIS Benchmark</strong> — scorează pe CIS Docker 1.x. Egress Audit e o felie mai îngustă, mai acționabilă, din "section 5: runtime".</li>
  <li><strong>Remediation Wizard</strong> — aplică fix-uri la nivel compose. Nu e (încă) integrat cu findings Egress — asta e planificată pentru v6.7 alături de filtrul outbound.</li>
</ul>

