'use strict';

// Platform detection — v6.12.0
//
// Infers the host's platform (Synology DSM, Unraid, TrueNAS SCALE, QNAP,
// OpenMediaVault, or a generic Linux distro) from Docker's `info` response —
// no SSH probes needed. The `OperatingSystem` / `Name` / `KernelVersion`
// fields already carry enough signal for NAS identification.
//
// Returns a normalized `{platform, label, version, category, iconClass}`
// object that the UI uses to render a branded badge next to the OS string.
//
// Design: pure function over dockerInfo. Cheap enough to run per-request;
// cached via a small Map by hostId to skip the regex work.
//
// Known limitations:
//   - Cloud-vendor detection (AWS / GCP / Azure / Hetzner / DO) requires DMI
//     data which isn't in `docker info`. That's a v6.12.1 follow-up — runs
//     SSH `cat /sys/class/dmi/id/sys_vendor` over the existing tunnel.
//   - Synology DSM before 6.x isn't officially supported by Docker anymore.
//   - QNAP QTS variants are numerous; we do a best-effort match on known markers.

const _cache = new Map();  // hostId → detected info

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
  if (hostId == null) _cache.clear();
  else _cache.delete(hostId);
}

function peek(hostId) {
  return _cache.get(hostId) || null;
}

module.exports = {
  detectFromDockerInfo,
  detectForHost,
  invalidate,
  peek,
  _internals: { _detectGenericLinux, _genericLinux },
};
