---
title: 'Request a Let''s Encrypt Certificate via DNS Challenge'
summary: 'Issue free Let''s Encrypt certificates from inside Docker Dash via the DNS-01 challenge — works on internal networks, supports wildcards, with 5 DNS providers (Cloudflare, Route53, DigitalOcean, Hetzner, Linode).'
category: security
difficulty: intermediate
icon: fas fa-magic
---

<h2>What this wizard does</h2>
<p>The wizard requests an actual Let's Encrypt certificate for one or more domains via Caddy's built-in ACME client. You walk through 3 steps in a modal, hit "Issue", and the cert lands in Caddy's automation policies — auto-renewing every 60 days with no further action.</p>

<h2>When to use DNS-01 vs HTTP-01</h2>
<table style="width:100%;border-collapse:collapse;font-size:13px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Challenge</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Use when…</th></tr>
<tr><td style="padding:6px"><strong>HTTP-01</strong></td><td style="padding:6px">Port 80 is reachable from the public internet on this host. Simplest. No API tokens needed.</td></tr>
<tr><td style="padding:6px"><strong>DNS-01</strong></td><td style="padding:6px">Internal/private networks (no public port 80), wildcard certificates (<code>*.example.com</code>), or you don't want to expose port 80.</td></tr>
</table>

<h2>Prerequisites</h2>
<ul>
  <li>Caddy TLS profile running: <code>docker compose --profile tls up -d</code></li>
  <li>For DNS-01: an account at one of the supported DNS providers (Cloudflare, AWS Route53, DigitalOcean, Hetzner DNS, Linode)</li>
  <li>You control the DNS for the domain(s) you want a cert for</li>
</ul>

<h2>Step 1 — Create a scoped API token at your DNS provider</h2>
<p>Use a <strong>scoped token, NOT a global API key</strong>. Docker Dash will reject Cloudflare Global Keys by format. For other providers it warns but accepts.</p>

<h3>Cloudflare</h3>
<ol>
  <li>Cloudflare Dashboard → My Profile → API Tokens → <strong>Create Token</strong></li>
  <li>Use the <strong>"Edit zone DNS"</strong> template</li>
  <li>Under <strong>Zone Resources</strong>, select <strong>only the specific zone(s)</strong> you want to issue certs for (not "All zones")</li>
  <li>Optionally restrict by IP and TTL</li>
  <li>Continue to summary → Create Token → copy the token immediately (shown only once)</li>
</ol>

<h3>AWS Route53</h3>
<p>Create an IAM user with this minimal policy (replace <code>HOSTED_ZONE_ID</code>):</p>
<pre><code>{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["route53:ListHostedZones", "route53:GetChange"],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": ["route53:ChangeResourceRecordSets"],
      "Resource": "arn:aws:route53:::hostedzone/HOSTED_ZONE_ID"
    }
  ]
}</code></pre>

<h3>DigitalOcean</h3>
<p>API → Tokens → Generate New Token → Personal Access Token with <strong>Read+Write</strong> scope.</p>

<h3>Hetzner DNS</h3>
<p>Hetzner DNS Console → API tokens → Create new. The token has full DNS write access — store securely.</p>

<h3>Linode</h3>
<p>Cloud Manager → My Profile → API Tokens → Create Token. Limit access to <strong>Domains: Read/Write</strong> only — leave everything else "None".</p>

<h2>Step 2 — Open the wizard</h2>
<p>Go to <strong>System → Secrets → Audit & Wizard → Certificates</strong> sub-tab → click the <strong>Request Let's Encrypt</strong> button (gradient blue).</p>

<h2>Step 3 — Walk through the wizard</h2>

<h3>Wizard Step 1: Domains & Challenge</h3>
<ul>
  <li><strong>Domains</strong>: comma-separated. Example: <code>api.example.com, *.api.example.com</code></li>
  <li><strong>Email</strong>: your email for ACME notifications (Let's Encrypt will email you about expiry/issues)</li>
  <li><strong>Challenge type</strong>: pick HTTP-01 or DNS-01. Wildcards force DNS-01 automatically.</li>
  <li><strong>Use Let's Encrypt staging</strong>: <strong>leave this ON for the first issuance</strong> on a new domain. Staging certs are not browser-trusted, but they don't count against rate limits. Once you confirm everything works, repeat with staging OFF.</li>
</ul>

<h3>Wizard Step 2: Provider & Credentials</h3>
<ul>
  <li>Choose <strong>Create new</strong> or <strong>Use saved credential</strong></li>
  <li>Pick the DNS provider</li>
  <li>Paste the API token(s) from Step 1 above</li>
  <li>Toggle <strong>Save this credential for reuse</strong> if you'll issue more certs with it later (you must save credentials for DNS-01 — anonymous credentials aren't supported in v6.5)</li>
  <li>Toggle <strong>Validate credential</strong> to call the provider's API and confirm the token works before burning a Let's Encrypt rate limit slot</li>
</ul>

<h3>Wizard Step 3: Confirm & Issue</h3>
<ul>
  <li>Review the summary table (domains, email, challenge, credential, env)</li>
  <li>Click <strong>Issue Certificate</strong></li>
  <li>The wizard polls every 3 seconds. Status: <code>pending → running → success</code> (or <code>failed</code>)</li>
  <li>Output streams into a black terminal box — you'll see "DNS record added", "waiting for propagation", "ACME challenge passed", "certificate issued"</li>
  <li>Total time: 30 seconds for HTTP-01, 1-5 minutes for DNS-01 depending on provider propagation speed</li>
</ul>

<h2>After issuance</h2>
<ul>
  <li>The cert appears in <strong>Let's Encrypt Managed Certificates</strong> table on the same tab</li>
  <li>Caddy auto-renews 30 days before expiry — no Docker Dash involvement needed</li>
  <li>The cert also appears in <strong>Tracked Certificates</strong> (via the daily scan at 07:30) so you get expiry warnings</li>
  <li>Audit log captures the issuance with credential ID (not value) and SHA fingerprint</li>
</ul>

<h2>Common errors and fixes</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px">
<tr><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Error</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Cause</th><th style="text-align:left;border-bottom:1px solid var(--border);padding:6px">Fix</th></tr>
<tr><td style="padding:6px">Caddy admin socket not found</td><td style="padding:6px">TLS profile not started</td><td style="padding:6px"><code>docker compose --profile tls up -d</code></td></tr>
<tr><td style="padding:6px">This looks like a Cloudflare Global API Key</td><td style="padding:6px">You used a 37-hex-char Global Key</td><td style="padding:6px">Create a scoped API Token instead (see Step 1)</td></tr>
<tr><td style="padding:6px">Token verification failed</td><td style="padding:6px">Token revoked, expired, or wrong scope</td><td style="padding:6px">Regenerate token with correct scope</td></tr>
<tr><td style="padding:6px">DNS challenge failed (after 5 min)</td><td style="padding:6px">Slow DNS propagation</td><td style="padding:6px">Retry — Caddy will resume from where it stopped</td></tr>
<tr><td style="padding:6px">Wildcard domains require dns-01</td><td style="padding:6px">You picked HTTP-01 with a wildcard domain</td><td style="padding:6px">Wizard auto-corrects this on Next; just continue</td></tr>
<tr><td style="padding:6px">Let's Encrypt rate limit hit</td><td style="padding:6px">Too many issuances for this domain in the last week</td><td style="padding:6px">Wait, or use staging environment to test config</td></tr>
</table>

<h2>Removing a managed certificate</h2>
<p>From the <strong>Let's Encrypt Managed Certificates</strong> table, click the trash icon → confirm. This removes the Caddy automation policy. The cert files on disk in <code>/data/caddy</code> are NOT deleted (Caddy may still serve them until next reload — that's intentional, no service interruption).</p>

<h2>Rotating a credential</h2>
<p>If your provider API token leaks or expires:</p>
<ol>
  <li>Generate a new token at the provider</li>
  <li>Saved DNS Credentials table → click the validate button to test the new token</li>
  <li>(Manual API call until UI for rotation lands in v6.5.1) — for now, delete the old credential + create a new one with the same name</li>
</ol>
<p>Caddy reads the credential file <strong>on every request</strong> (verified in preflight), so rotation is zero-downtime — no Caddy reload needed.</p>

<h2>Migration from Caddyfile-based TLS</h2>
<p>If you previously edited Caddyfile by hand to issue certs, the wizard's policies coexist via Caddy's JSON config tree. Don't add manual <code>tls</code> directives in Caddyfile for the same domains — Caddy will deduplicate but with unpredictable order.</p>
