'use strict';

// Remediation Catalog — v6.6 Container Remediation Wizard
//
// Each entry is a self-contained module exporting {code, applies(), plan()}.
// Adding a new entry = ~30 LOC PR. Spec: docs/planning/v6.6/remediation-wizard/02-deep-spec.md §1.
//
// `applies(inspect)` — pure function, no Docker API calls; returns boolean.
// `plan(inspect, composeService)` — returns {composePatch, cliCommands, liveUpdate, notes}.

const DANGEROUS_CAPS = new Set(['SYS_ADMIN', 'NET_ADMIN', 'SYS_PTRACE', 'SYS_MODULE', 'DAC_READ_SEARCH']);

const CATALOG = {
  // ─── CIS container-runtime fixes (5.x) ─────────────────

  'CIS-5.4-privileged': {
    code: 'CIS-5.4-privileged',
    title: 'Privileged mode',
    category: 'security',
    severity: 'critical',
    cisRef: '5.4',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'medium',
    riskNotes: 'Removing privileged may break containers needing specific kernel capabilities. Check image docs.',
    applies(inspect) { return inspect.HostConfig?.Privileged === true; },
    plan() {
      return {
        composePatch: { privileged: null },
        cliCommands: [],
        liveUpdate: null,
        notes: 'Container recreated without privileged flag.',
      };
    },
  },

  'CIS-5.3-cap-add-all': {
    code: 'CIS-5.3-cap-add-all',
    title: 'cap_add: [ALL]',
    category: 'security',
    severity: 'critical',
    cisRef: '5.3',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'medium',
    riskNotes: 'Dropping ALL caps may break containers; start with cap_drop: [ALL] + minimal cap_add.',
    applies(inspect) {
      const caps = inspect.HostConfig?.CapAdd || [];
      return caps.includes('ALL') || caps.includes('CAP_ALL');
    },
    plan() {
      return {
        composePatch: { cap_add: { $remove: ['ALL', 'CAP_ALL'] }, cap_drop: ['ALL'] },
        cliCommands: [],
        liveUpdate: null,
        notes: 'Dropped all caps. Add specific ones via cap_add if image needs them.',
      };
    },
  },

  'CIS-5.3-dangerous-caps': {
    code: 'CIS-5.3-dangerous-caps',
    title: 'Dangerous capabilities added',
    category: 'security',
    severity: 'warn',
    cisRef: '5.3',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'high',
    riskNotes: 'Some images need these (VPNs, tailscale, wireguard). Verify manually before applying.',
    applies(inspect) {
      const caps = inspect.HostConfig?.CapAdd || [];
      return caps.some(c => DANGEROUS_CAPS.has(c.replace(/^CAP_/, '')));
    },
    plan(inspect) {
      const caps = inspect.HostConfig?.CapAdd || [];
      const dangerous = caps.filter(c => DANGEROUS_CAPS.has(c.replace(/^CAP_/, '')));
      return {
        composePatch: { cap_add: { $remove: dangerous } },
        cliCommands: [],
        liveUpdate: null,
        notes: `Removed dangerous capabilities: ${dangerous.join(', ')}.`,
      };
    },
  },

  'CIS-5.25-no-new-privileges': {
    code: 'CIS-5.25-no-new-privileges',
    title: 'Missing no-new-privileges',
    category: 'security',
    severity: 'warn',
    cisRef: '5.25',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'low',
    riskNotes: 'Low risk — only breaks setuid/setgid binaries inside the container, which are rare.',
    applies(inspect) {
      const opts = inspect.HostConfig?.SecurityOpt || [];
      return !opts.some(o => o === 'no-new-privileges:true' || o === 'no-new-privileges');
    },
    plan() {
      return {
        composePatch: { security_opt: { $add: ['no-new-privileges:true'] } },
        cliCommands: [],
        liveUpdate: null,
        notes: 'Added no-new-privileges to prevent setuid/setgid privilege escalation.',
      };
    },
  },

  'CIS-5.28-pid-host': {
    code: 'CIS-5.28-pid-host',
    title: 'pid: host (host PID namespace)',
    category: 'security',
    severity: 'critical',
    cisRef: '5.28',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'medium',
    riskNotes: 'Required by some monitoring agents (cAdvisor, node-exporter w/ host PID). Verify use case.',
    applies(inspect) { return inspect.HostConfig?.PidMode === 'host'; },
    plan() {
      return {
        composePatch: { pid: null },
        cliCommands: [],
        liveUpdate: null,
        notes: 'Removed pid: host. Container uses its own PID namespace.',
      };
    },
  },

  'CIS-5.29-network-host': {
    code: 'CIS-5.29-network-host',
    title: 'network_mode: host',
    category: 'security',
    severity: 'warn',
    cisRef: '5.29',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'high',
    riskNotes: 'Required by some VPN/DNS containers (pihole, wireguard). Verify use case. Removing forces you to expose ports explicitly.',
    applies(inspect) { return inspect.HostConfig?.NetworkMode === 'host'; },
    plan() {
      return {
        composePatch: { network_mode: null },
        cliCommands: [],
        liveUpdate: null,
        notes: 'Removed network_mode: host. Configure explicit port mappings + networks.',
      };
    },
  },

  'CIS-5.16-ipc-host': {
    code: 'CIS-5.16-ipc-host',
    title: 'ipc: host (host IPC namespace)',
    category: 'security',
    severity: 'warn',
    cisRef: '5.16',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'medium',
    riskNotes: 'Some containers share shm with host for performance (X11 forwarding, some scientific apps).',
    applies(inspect) { return inspect.HostConfig?.IpcMode === 'host'; },
    plan() {
      return {
        composePatch: { ipc: null },
        cliCommands: [],
        liveUpdate: null,
        notes: 'Removed ipc: host. Container uses its own IPC namespace.',
      };
    },
  },

  'CIS-5.12-read-only-rootfs': {
    code: 'CIS-5.12-read-only-rootfs',
    title: 'Writable root filesystem',
    category: 'security',
    severity: 'info',
    cisRef: '5.12',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'high',
    riskNotes: 'HIGH break-rate. Many apps write to /var/log, /tmp, /var/cache, /run. Auto-suggesting tmpfs paths.',
    applies(inspect) { return inspect.HostConfig?.ReadonlyRootfs !== true; },
    plan() {
      return {
        composePatch: {
          read_only: true,
          tmpfs: { $add: ['/tmp:rw,noexec,nosuid,size=64m', '/var/run:rw,noexec,nosuid,size=16m'] },
        },
        cliCommands: [],
        liveUpdate: null,
        notes: 'Root FS made read-only. tmpfs mounted at /tmp and /var/run. Add more tmpfs paths if container still breaks.',
      };
    },
  },

  'CIS-5.10-no-memory-limit': {
    code: 'CIS-5.10-no-memory-limit',
    title: 'No memory limit',
    category: 'resource',
    severity: 'warn',
    cisRef: '5.10',
    liveUpdatable: true,
    requiresRecreation: false,
    riskLevel: 'low',
    riskNotes: 'Auto-sized to max(256m, 2× current RSS). Adjust if container has memory spikes.',
    applies(inspect) { return (inspect.HostConfig?.Memory || 0) === 0; },
    plan(inspect) {
      const currentRss = inspect._stats?.memory_stats?.usage || 128 * 1024 * 1024;
      const safeLimit = Math.max(256 * 1024 * 1024, currentRss * 2);
      const limitMb = Math.ceil(safeLimit / (1024 * 1024));
      return {
        composePatch: { mem_limit: `${limitMb}m` },
        cliCommands: [],
        liveUpdate: `docker update --memory ${limitMb}m --memory-swap ${limitMb}m ${inspect.Id}`,
        notes: `Memory limit set to ${limitMb}m (2× current RSS). Zero downtime — no restart.`,
      };
    },
  },

  'CIS-5.11-no-cpu-limit': {
    code: 'CIS-5.11-no-cpu-limit',
    title: 'No CPU limit',
    category: 'resource',
    severity: 'info',
    cisRef: '5.11',
    liveUpdatable: true,
    requiresRecreation: false,
    riskLevel: 'low',
    riskNotes: 'Default limit of 2 CPUs. Adjust per workload.',
    applies(inspect) { return (inspect.HostConfig?.NanoCpus || 0) === 0 && !inspect.HostConfig?.CpuQuota; },
    plan(inspect) {
      return {
        composePatch: { cpus: '2.0' },
        cliCommands: [],
        liveUpdate: `docker update --cpus 2.0 ${inspect.Id}`,
        notes: 'CPU limit set to 2.0. Zero downtime — no restart.',
      };
    },
  },

  'CIS-5.5-sensitive-bind-rw': {
    code: 'CIS-5.5-sensitive-bind-rw',
    title: 'Sensitive host directory bind-mounted read-write',
    category: 'security',
    severity: 'critical',
    cisRef: '5.5',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'medium',
    riskNotes: 'If the app needs to modify the bind, keep it and document why; otherwise :ro prevents privilege escalation via host file manipulation.',
    applies(inspect) {
      const sensitive = ['/etc', '/boot', '/lib', '/sbin', '/usr', '/var/lib/docker'];
      return (inspect.Mounts || []).some(m =>
        m.Type === 'bind' && !m.RW === false && sensitive.some(p => m.Source === p || m.Source?.startsWith(p + '/'))
      );
    },
    plan(inspect) {
      const sensitive = ['/etc', '/boot', '/lib', '/sbin', '/usr', '/var/lib/docker'];
      const offending = (inspect.Mounts || [])
        .filter(m => m.Type === 'bind' && m.RW !== false && sensitive.some(p => m.Source === p || m.Source?.startsWith(p + '/')))
        .map(m => `${m.Source}:${m.Destination}`);
      return {
        composePatch: {},  // volume patches are complex; hand off via cliCommands + note
        cliCommands: [],
        liveUpdate: null,
        notes: `Flagged: ${offending.join(', ')}. Manual fix: change :rw to :ro in the compose volumes: section for each sensitive path.`,
      };
    },
  },

  'CIS-5.5-docker-socket-rw': {
    code: 'CIS-5.5-docker-socket-rw',
    title: 'Docker socket mounted read-write',
    category: 'security',
    severity: 'warn',
    cisRef: '5.31',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'medium',
    riskNotes: ':ro mount usually works. For full lockdown, use tecnativa/docker-socket-proxy as a sidecar.',
    applies(inspect) {
      return (inspect.Mounts || []).some(m =>
        (m.Source?.includes('docker.sock') || m.Destination?.includes('docker.sock')) && m.RW !== false
      );
    },
    plan() {
      return {
        composePatch: {},  // volume RW→RO patch is complex; hand off via notes
        cliCommands: [],
        liveUpdate: null,
        notes: 'Manual fix: change the docker.sock volume mount from :rw (default) to :ro. Example: /var/run/docker.sock:/var/run/docker.sock:ro',
      };
    },
  },

  'CIS-5.26-running-as-root': {
    code: 'CIS-5.26-running-as-root',
    title: 'Container running as root',
    category: 'security',
    severity: 'warn',
    cisRef: '5.26',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'high',
    riskNotes: 'Many images only work as root (e.g., nginx binding to 80). Test with user: 1000:1000 before applying to prod.',
    applies(inspect) {
      const user = inspect.Config?.User || '';
      return user === '' || user === 'root' || user === '0' || user === '0:0';
    },
    plan() {
      return {
        composePatch: { user: '1000:1000' },
        cliCommands: [],
        liveUpdate: null,
        notes: 'Set user to 1000:1000. Verify image supports non-root user (may need tmpfs for /tmp writes).',
      };
    },
  },

  'RES-no-pids-limit': {
    code: 'RES-no-pids-limit',
    title: 'No PID limit',
    category: 'resource',
    severity: 'info',
    cisRef: null,
    liveUpdatable: true,
    requiresRecreation: false,
    riskLevel: 'low',
    riskNotes: 'Default 200 PIDs. Raise for workloads that spawn many subprocesses (CI runners, build systems).',
    applies(inspect) {
      const limit = inspect.HostConfig?.PidsLimit;
      return limit == null || limit === 0 || limit === -1;
    },
    plan(inspect) {
      return {
        composePatch: { pids_limit: 200 },
        cliCommands: [],
        liveUpdate: `docker update --pids-limit 200 ${inspect.Id}`,
        notes: 'PID limit set to 200. Zero downtime — no restart.',
      };
    },
  },

  'RES-no-restart-policy': {
    code: 'RES-no-restart-policy',
    title: 'No restart policy',
    category: 'reliability',
    severity: 'info',
    cisRef: null,
    liveUpdatable: true,
    requiresRecreation: false,
    riskLevel: 'low',
    riskNotes: 'Default unless-stopped. Use "no" for one-shot jobs.',
    applies(inspect) {
      const policy = inspect.HostConfig?.RestartPolicy?.Name || 'no';
      return policy === 'no' || policy === '';
    },
    plan(inspect) {
      return {
        composePatch: { restart: 'unless-stopped' },
        cliCommands: [],
        liveUpdate: `docker update --restart unless-stopped ${inspect.Id}`,
        notes: 'Restart policy set to unless-stopped. Zero downtime — no restart.',
      };
    },
  },

  'SEC-plaintext-env-secret': {
    code: 'SEC-plaintext-env-secret',
    title: 'Plain-text secret in environment variable',
    category: 'security',
    severity: 'critical',
    cisRef: null,
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'medium',
    riskNotes: 'Route to Secrets Wizard for full _FILE pattern setup.',
    applies(inspect) {
      const env = inspect.Config?.Env || [];
      const sensitive = /password|secret|token|api_key|apikey|private_key|auth|credential/i;
      return env.some(e => {
        const [key, ...val] = e.split('=');
        const value = val.join('=');
        return sensitive.test(key) && value && !value.includes('/run/secrets') && !key.endsWith('_FILE') && value !== '' && !value.startsWith('${');
      });
    },
    plan() {
      return {
        composePatch: {},
        cliCommands: [],
        liveUpdate: null,
        notes: 'Route to Secrets Wizard (System → Secrets → Audit & Wizard) for full _FILE pattern + /run/secrets setup.',
      };
    },
  },

  'SEC-image-latest-tag': {
    code: 'SEC-image-latest-tag',
    title: 'Image uses :latest tag or no tag',
    category: 'security',
    severity: 'warn',
    cisRef: '4.2',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'low',
    riskNotes: 'Pin to a specific version tag or content digest (@sha256:...) for reproducibility.',
    applies(inspect) {
      const img = inspect.Config?.Image || '';
      return img.endsWith(':latest') || (!img.includes(':') && !img.includes('@'));
    },
    plan(inspect) {
      return {
        composePatch: {},
        cliCommands: [],
        liveUpdate: null,
        notes: `Manual fix: change image from ${inspect.Config?.Image} to a pinned version (e.g., ${inspect.Config?.Image.split(':')[0]}:1.2.3) or content digest.`,
      };
    },
  },

  'REL-no-healthcheck': {
    code: 'REL-no-healthcheck',
    title: 'No healthcheck defined',
    category: 'reliability',
    severity: 'info',
    cisRef: null,
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'low',
    riskNotes: 'Without healthchecks, compose cannot track container readiness. Image-specific — default suggested here is an HTTP GET on the first exposed port.',
    applies(inspect) {
      return !inspect.Config?.Healthcheck || inspect.Config?.Healthcheck?.Test?.[0] === 'NONE';
    },
    plan(inspect) {
      const firstPort = Object.keys(inspect.NetworkSettings?.Ports || {})[0];
      const port = firstPort ? firstPort.split('/')[0] : '80';
      return {
        composePatch: {
          healthcheck: {
            test: ['CMD-SHELL', `wget -q --spider http://localhost:${port}/ || exit 1`],
            interval: '30s',
            timeout: '5s',
            retries: 3,
            start_period: '10s',
          },
        },
        cliCommands: [],
        liveUpdate: null,
        notes: `Added HTTP healthcheck on port ${port}. Adjust the test command if the container is not an HTTP service.`,
      };
    },
  },

  'REL-unbounded-logging': {
    code: 'REL-unbounded-logging',
    title: 'Logging driver unbounded (no rotation)',
    category: 'reliability',
    severity: 'info',
    cisRef: '2.12',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'low',
    riskNotes: 'Without rotation, json-file logs can fill disk. Limits are safe to apply.',
    applies(inspect) {
      const driver = inspect.HostConfig?.LogConfig?.Type || 'json-file';
      const opts = inspect.HostConfig?.LogConfig?.Config || {};
      return driver === 'json-file' && !opts['max-size'];
    },
    plan() {
      return {
        composePatch: {
          logging: {
            driver: 'json-file',
            options: { 'max-size': '10m', 'max-file': '3' },
          },
        },
        cliCommands: [],
        liveUpdate: null,
        notes: 'Log rotation: 10m per file, max 3 files. Prevents logs from filling disk.',
      };
    },
  },

  'CIS-5.7-privileged-ports': {
    code: 'CIS-5.7-privileged-ports',
    title: 'Binding to privileged ports (<1024)',
    category: 'security',
    severity: 'info',
    cisRef: '5.7',
    liveUpdatable: false,
    requiresRecreation: true,
    riskLevel: 'medium',
    riskNotes: 'Many reverse-proxy setups use port 80/443 intentionally. Skip if container IS the reverse proxy.',
    applies(inspect) {
      const ports = inspect.NetworkSettings?.Ports || {};
      return Object.values(ports).some(bindings =>
        Array.isArray(bindings) && bindings.some(b => parseInt(b.HostPort) < 1024)
      );
    },
    plan() {
      return {
        composePatch: {},
        cliCommands: [],
        liveUpdate: null,
        notes: 'Manual fix: remap port bindings to high ports (e.g., "8080:80") and put a reverse proxy (Caddy, Traefik) in front for ports 80/443.',
      };
    },
  },
};

/**
 * Run every catalog entry's applies() against an inspect output.
 * @returns {string[]} codes of entries that apply
 */
function detectFindings(inspect) {
  const applicable = [];
  for (const [code, entry] of Object.entries(CATALOG)) {
    try {
      if (entry.applies(inspect)) applicable.push(code);
    } catch { /* entry bug; skip */ }
  }
  return applicable;
}

/** Retrieve a single catalog entry by code. */
function get(code) {
  return CATALOG[code] || null;
}

/** List all catalog codes + metadata (without the functions). */
function list() {
  return Object.values(CATALOG).map(e => ({
    code: e.code,
    title: e.title,
    category: e.category,
    severity: e.severity,
    cisRef: e.cisRef,
    liveUpdatable: e.liveUpdatable,
    requiresRecreation: e.requiresRecreation,
    riskLevel: e.riskLevel,
    riskNotes: e.riskNotes,
  }));
}

module.exports = { detectFindings, get, list, CATALOG };
