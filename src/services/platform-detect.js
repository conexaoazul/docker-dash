'use strict';

// Platform detection — v6.12.0 (OS) + v6.12.1 (cloud DMI)
//
// Infers the host's platform (Synology DSM, Unraid, TrueNAS SCALE, QNAP,
// OpenMediaVault, or a generic Linux distro) from Docker's `info` response —
// no SSH probes needed. The `OperatingSystem` / `Name` / `KernelVersion`
// fields already carry enough signal for NAS identification.
//
// v6.12.1 adds OPTIONAL cloud-vendor detection via `/sys/class/dmi/id/`
// (Amazon EC2, Google GCE, Azure, Hetzner, DigitalOcean, Linode, Vultr,
// Oracle Cloud, VMware, VirtualBox, QEMU/KVM). Separate probe because DMI
// isn't in `docker info` — requires one local fs read (local host) or one
// SSH exec (remote host, reusing v6.8.0 tunnel).
//
// Returns a normalized `{platform, label, version, category, iconClass}`
// object that the UI uses to render a branded badge next to the OS string.
//
// Design: pure function over dockerInfo. Cheap enough to run per-request;
// cached via a small Map by hostId to skip the regex work.
//
// Known limitations:
//   - Synology DSM before 6.x isn't officially supported by Docker anymore.
//   - QNAP QTS variants are numerous; we do a best-effort match on known markers.
//   - DMI files may be restricted in some hardened containers; probe degrades
//     silently to `null` in that case.

const _cache = new Map();  // hostId → detected OS info
const _cloudCache = new Map();  // hostId → detected cloud info (or null)

/** Detect platform from a dockerInfo object (the `info` field returned by
 *  dockerService.getInfo). Returns null if nothing specific matched. */
function detectFromDockerInfo(dockerInfo) {
  if (!dockerInfo || typeof dockerInfo !== 'object') return _genericLinux();

  const os = String(dockerInfo.os || dockerInfo.OperatingSystem || '');
  const kernel = String(dockerInfo.kernelVersion || dockerInfo.KernelVersion || '');
  const name = String(dockerInfo.hostname || dockerInfo.Name || '');

  // ─── Synology DSM ────────────────────────────────
  // OperatingSystem looks like "DSM 7.2-64570 Update 3" or "Synology DSM 6.2.4".
  // Kernel is an unusually old Synology kernel (e.g. "4.4.302+").
  const synMatch = os.match(/(?:Synology\s+)?DSM\s+([\d.-]+(?:\s+Update\s+\d+)?)/i);
  if (synMatch) {
    return {
      platform: 'synology',
      label: 'Synology DSM',
      version: synMatch[1].trim(),
      category: 'nas',
      iconClass: 'fas fa-hdd',
      color: '#11457e',
      notes: 'Container Manager detected. Remember: docker commands need sudo or the user added to the `docker` group.',
    };
  }

  // ─── Unraid ──────────────────────────────────────
  // OperatingSystem typically "Unraid" or includes a Slackware marker.
  // Hostname often "Tower" by default.
  if (/unraid/i.test(os) || /unraid/i.test(kernel) || (name.toLowerCase() === 'tower' && /slackware/i.test(os))) {
    const ver = (os.match(/Unraid\s+([\d.]+)/i) || kernel.match(/([\d.]+)-Unraid/i) || [])[1];
    return {
      platform: 'unraid',
      label: 'Unraid',
      version: ver || '',
      category: 'nas',
      iconClass: 'fab fa-docker',  // Unraid has no official icon; use Docker
      color: '#f15a29',
      notes: 'Unraid host — Docker socket standard, SSH often as root. Community Apps ecosystem available.',
    };
  }

  // ─── TrueNAS SCALE ───────────────────────────────
  // SCALE 24.10 "Electric Eel" returned to Docker (from K3s). OperatingSystem
  // shows Debian GNU/Linux; we rely on the hostname or dmi for positive ID.
  // KernelVersion often has "-truenas-production" marker in Electric Eel.
  if (/truenas/i.test(os) || /truenas/i.test(kernel)) {
    return {
      platform: 'truenas',
      label: 'TrueNAS SCALE',
      version: (kernel.match(/([\d.]+)-truenas/i) || [])[1] || '',
      category: 'nas',
      iconClass: 'fas fa-server',
      color: '#0095d5',
      notes: 'Electric Eel or newer (Docker-based). Avoid interfering with TrueNAS-managed apps.',
    };
  }

  // ─── QNAP QTS / QuTS hero ────────────────────────
  // QNAP Container Station runs on QTS. OperatingSystem often shows
  // "QNAP" or a QTS-prefixed kernel.
  if (/QTS|QuTS|QNAP/i.test(os) || /QNAP/i.test(kernel)) {
    return {
      platform: 'qnap',
      label: 'QNAP',
      version: '',
      category: 'nas',
      iconClass: 'fas fa-hdd',
      color: '#ee3a25',
      notes: 'Container Station wraps Docker; SSH + socket access can vary by QTS version.',
    };
  }

  // ─── OpenMediaVault ──────────────────────────────
  // Debian-based. OpenMediaVault-specific signal is rarely in docker info
  // itself (often Debian GNU/Linux showing). We can hint via hostname only.
  if (/openmediavault/i.test(os) || /openmediavault/i.test(name)) {
    return {
      platform: 'omv',
      label: 'OpenMediaVault',
      version: '',
      category: 'nas',
      iconClass: 'fas fa-server',
      color: '#43a047',
      notes: 'OMV with Docker plugin. Standard socket, standard SSH.',
    };
  }

  // ─── Generic Linux (parse distro) ────────────────
  return _detectGenericLinux(os, kernel);
}

function _detectGenericLinux(os, kernel) {
  // Docker info's OperatingSystem is typically "Ubuntu 22.04.3 LTS" etc.
  const distros = [
    { re: /Ubuntu\s*([\d.]+)/i,           label: 'Ubuntu',       platform: 'ubuntu',   icon: 'fab fa-ubuntu',    color: '#e95420' },
    { re: /Debian\s*(?:GNU\/Linux\s*)?([\d.]+)?/i, label: 'Debian', platform: 'debian', icon: 'fab fa-debian',   color: '#a80030' },
    { re: /Fedora(?:\s*Linux)?\s*([\d.]+)?/i,      label: 'Fedora', platform: 'fedora', icon: 'fab fa-fedora',   color: '#294172' },
    { re: /CentOS(?:\s*Stream)?\s*([\d.]+)?/i,     label: 'CentOS', platform: 'centos', icon: 'fab fa-centos',   color: '#932279' },
    { re: /Rocky\s*Linux\s*([\d.]+)?/i,            label: 'Rocky Linux', platform: 'rocky', icon: 'fas fa-mountain', color: '#10b981' },
    { re: /AlmaLinux\s*([\d.]+)?/i,                label: 'AlmaLinux',   platform: 'alma',  icon: 'fas fa-server', color: '#0d597f' },
    { re: /Alpine\s*Linux\s*([\d.]+)?/i,           label: 'Alpine',      platform: 'alpine', icon: 'fas fa-mountain', color: '#0d597f' },
    { re: /Red\s*Hat|RHEL/i,                       label: 'Red Hat',     platform: 'rhel',  icon: 'fab fa-redhat', color: '#ee0000' },
    { re: /Arch\s*Linux/i,                         label: 'Arch Linux',  platform: 'arch',  icon: 'fas fa-server', color: '#1793d1' },
    { re: /openSUSE/i,                             label: 'openSUSE',    platform: 'opensuse', icon: 'fas fa-server', color: '#73ba25' },
  ];
  for (const d of distros) {
    const m = os.match(d.re);
    if (m) {
      return {
        platform: d.platform,
        label: d.label,
        version: (m[1] || '').trim(),
        category: 'linux',
        iconClass: d.icon,
        color: d.color,
      };
    }
  }
  return _genericLinux(os, kernel);
}

function _genericLinux(os = '', kernel = '') {
  return {
    platform: 'linux',
    label: os || 'Linux',
    version: '',
    category: 'linux',
    iconClass: 'fab fa-linux',
    color: '#000',
  };
}

/** Cached helper — recomputes from the fresh docker info but avoids re-running
 *  the regex chain on every multi-host page render. Cache invalidated on
 *  `invalidate(hostId)` (e.g. tunnel reconnect). */
function detectForHost(hostId, dockerInfo) {
  if (_cache.has(hostId)) return _cache.get(hostId);
  const result = detectFromDockerInfo(dockerInfo);
  _cache.set(hostId, result);
  return result;
}

function invalidate(hostId) {
  if (hostId == null) { _cache.clear(); _cloudCache.clear(); return; }
  _cache.delete(hostId);
  _cloudCache.delete(hostId);
}

function peek(hostId) {
  return _cache.get(hostId) || null;
}

// Returns cached cloud info, or `undefined` if not yet probed for this host.
// A cached `null` means "probed but DMI unreadable" (different from "not probed").
function peekCloud(hostId) {
  return _cloudCache.has(hostId) ? _cloudCache.get(hostId) : undefined;
}

// ─── Cloud-vendor detection (v6.12.1) ─────────────
//
// DMI strings come from `/sys/class/dmi/id/sys_vendor` and `/product_name`.
// Canonical signatures documented by each provider. Generic "QEMU" vendor
// (common on OVH, Scaleway, Oracle's pre-2020 shapes, homelab Proxmox) is
// mapped to "KVM" — we can't reliably distinguish them without more probes.

const _CLOUD_SIGNATURES = [
  // Public cloud
  { match: v => /amazon\s*ec2/i.test(v.vendor), vendor: 'aws',        label: 'AWS EC2',          iconClass: 'fab fa-aws',             color: '#ff9900' },
  { match: v => /google/i.test(v.vendor) || /google\s+compute/i.test(v.product), vendor: 'gce', label: 'Google Cloud', iconClass: 'fab fa-google', color: '#4285f4' },
  { match: v => /microsoft/i.test(v.vendor) && /virtual\s+machine/i.test(v.product), vendor: 'azure', label: 'Azure VM', iconClass: 'fab fa-microsoft', color: '#0078d4' },
  { match: v => /digitalocean/i.test(v.vendor) || /droplet/i.test(v.product), vendor: 'do', label: 'DigitalOcean', iconClass: 'fab fa-digital-ocean', color: '#0080ff' },
  { match: v => /hetzner/i.test(v.vendor) || /hetzner/i.test(v.product), vendor: 'hetzner', label: 'Hetzner',       iconClass: 'fas fa-cloud',            color: '#d50c2d' },
  { match: v => /linode/i.test(v.vendor) || /linode/i.test(v.product),   vendor: 'linode',  label: 'Linode',         iconClass: 'fas fa-cloud',            color: '#00a95c' },
  { match: v => /vultr/i.test(v.vendor) || /vultr/i.test(v.product),     vendor: 'vultr',   label: 'Vultr',          iconClass: 'fas fa-cloud',            color: '#007bfc' },
  { match: v => /oracle/i.test(v.vendor) && !/virtualbox/i.test(v.product), vendor: 'oci', label: 'Oracle Cloud',     iconClass: 'fas fa-cloud',            color: '#c74634' },
  { match: v => /scaleway/i.test(v.vendor) || /scaleway/i.test(v.product), vendor: 'scaleway', label: 'Scaleway',     iconClass: 'fas fa-cloud',            color: '#4f0599' },
  { match: v => /ovh/i.test(v.vendor) || /ovh/i.test(v.product),         vendor: 'ovh',     label: 'OVHcloud',       iconClass: 'fas fa-cloud',            color: '#123f6d' },

  // Virtualization (on-prem / homelab)
  { match: v => /vmware/i.test(v.vendor) || /vmware/i.test(v.product),   vendor: 'vmware',  label: 'VMware',         iconClass: 'fas fa-server',           color: '#607078' },
  { match: v => /innotek|virtualbox/i.test(v.vendor) || /virtualbox/i.test(v.product), vendor: 'virtualbox', label: 'VirtualBox', iconClass: 'fas fa-box',  color: '#183a61' },
  { match: v => /xen/i.test(v.vendor) || /hvm\s+domu/i.test(v.product),  vendor: 'xen',     label: 'Xen',            iconClass: 'fas fa-server',           color: '#eb8c1b' },
  { match: v => /qemu/i.test(v.vendor),                                   vendor: 'kvm',     label: 'KVM/QEMU',       iconClass: 'fas fa-server',           color: '#e7442b' },
  { match: v => /parallels/i.test(v.vendor),                              vendor: 'parallels', label: 'Parallels',    iconClass: 'fas fa-server',           color: '#dd0031' },
];

/** Pure function — takes raw DMI strings (sys_vendor + product_name) and
 *  returns a normalized cloud info object, or null for bare-metal / unknown. */
function detectFromDmi(sysVendor, productName) {
  const v = {
    vendor: String(sysVendor || '').trim(),
    product: String(productName || '').trim(),
  };
  if (!v.vendor && !v.product) return null;

  for (const sig of _CLOUD_SIGNATURES) {
    if (sig.match(v)) {
      return {
        vendor: sig.vendor,
        label: sig.label,
        iconClass: sig.iconClass,
        color: sig.color,
        raw: { sys_vendor: v.vendor, product_name: v.product },
      };
    }
  }
  // Not recognized — return the raw vendor string as label so users can at
  // least see what their motherboard says ("Dell Inc.", "ASUSTeK", etc.).
  // Category "baremetal" distinguishes this from cloud in the UI.
  return {
    vendor: 'baremetal',
    label: v.vendor || 'Bare metal',
    iconClass: 'fas fa-microchip',
    color: '#64748b',
    raw: { sys_vendor: v.vendor, product_name: v.product },
  };
}

/** Probe DMI files for hostId (0 = local, >0 = remote via SSH tunnel).
 *  Returns a normalized cloud info object or null if probing failed.
 *  Caches the result; call `invalidate(hostId)` to re-probe. */
async function probeCloudForHost(hostId) {
  if (_cloudCache.has(hostId)) return _cloudCache.get(hostId);

  const remoteFs = require('./remote-fs');
  let sysVendor = '';
  let productName = '';

  try {
    if (await remoteFs.fileExists(hostId, '/sys/class/dmi/id/sys_vendor')) {
      sysVendor = (await remoteFs.readFile(hostId, '/sys/class/dmi/id/sys_vendor')).trim();
    }
  } catch { /* proceed with empty vendor */ }

  try {
    if (await remoteFs.fileExists(hostId, '/sys/class/dmi/id/product_name')) {
      productName = (await remoteFs.readFile(hostId, '/sys/class/dmi/id/product_name')).trim();
    }
  } catch { /* proceed with empty product */ }

  const result = detectFromDmi(sysVendor, productName);
  _cloudCache.set(hostId, result);
  return result;
}

module.exports = {
  detectFromDockerInfo,
  detectForHost,
  invalidate,
  peek,
  peekCloud,
  detectFromDmi,
  probeCloudForHost,
  _internals: { _detectGenericLinux, _genericLinux, _CLOUD_SIGNATURES },
};
