'use strict';

// Tests for src/services/platform-detect.js (v6.12.0)

const platformDetect = require('../services/platform-detect');
const detect = platformDetect.detectFromDockerInfo;

// ─── NAS platforms ──────────────────────────────

describe('Synology DSM', () => {
  it('recognizes DSM 7.2 from docker info', () => {
    const r = detect({
      os: 'DSM 7.2-64570 Update 3',
      kernelVersion: '4.4.302+',
      hostname: 'SynologyHome',
    });
    expect(r.platform).toBe('synology');
    expect(r.label).toBe('Synology DSM');
    expect(r.version).toMatch(/^7\.2-64570/);
    expect(r.category).toBe('nas');
  });

  it('recognizes DSM 6.x from old branding', () => {
    const r = detect({ os: 'Synology DSM 6.2.4-25556 Update 2' });
    expect(r.platform).toBe('synology');
    expect(r.version).toMatch(/6\.2\.4/);
  });
});

describe('Unraid', () => {
  it('recognizes by OS string', () => {
    const r = detect({ os: 'Unraid 6.12.10', hostname: 'Tower' });
    expect(r.platform).toBe('unraid');
    expect(r.version).toBe('6.12.10');
  });

  it('recognizes by Tower hostname + slackware kernel', () => {
    const r = detect({
      os: 'Slackware Linux',
      kernelVersion: '6.1.64-Unraid',
      hostname: 'Tower',
    });
    expect(r.platform).toBe('unraid');
  });
});

describe('TrueNAS SCALE', () => {
  it('recognizes Electric Eel via kernel marker', () => {
    const r = detect({
      os: 'Debian GNU/Linux 12 (bookworm)',
      kernelVersion: '6.6.44-truenas-production',
      hostname: 'truenas',
    });
    expect(r.platform).toBe('truenas');
    expect(r.label).toBe('TrueNAS SCALE');
    expect(r.version).toBe('6.6.44');
  });

  it('recognizes by OS string', () => {
    const r = detect({ os: 'TrueNAS SCALE 24.10.1' });
    expect(r.platform).toBe('truenas');
  });
});

describe('QNAP', () => {
  it('recognizes QTS', () => {
    const r = detect({ os: 'QTS 5.1.7.2770' });
    expect(r.platform).toBe('qnap');
  });

  it('recognizes QuTS hero', () => {
    const r = detect({ os: 'QuTS hero h5.1.0' });
    expect(r.platform).toBe('qnap');
  });
});

describe('OpenMediaVault', () => {
  it('recognizes via hostname hint', () => {
    const r = detect({ os: 'Debian GNU/Linux 12', hostname: 'openmediavault' });
    expect(r.platform).toBe('omv');
  });
});

// ─── Generic Linux distros ──────────────────────

describe('Generic Linux distros', () => {
  it('parses Ubuntu + version', () => {
    const r = detect({ os: 'Ubuntu 22.04.3 LTS' });
    expect(r.platform).toBe('ubuntu');
    expect(r.version).toBe('22.04.3');
    expect(r.category).toBe('linux');
  });

  it('parses Debian', () => {
    const r = detect({ os: 'Debian GNU/Linux 12 (bookworm)' });
    expect(r.platform).toBe('debian');
    expect(r.version).toBe('12');
  });

  it('parses Fedora', () => {
    const r = detect({ os: 'Fedora Linux 39 (Container Image)' });
    expect(r.platform).toBe('fedora');
  });

  it('parses Rocky Linux', () => {
    const r = detect({ os: 'Rocky Linux 9.3 (Blue Onyx)' });
    expect(r.platform).toBe('rocky');
    expect(r.version).toBe('9.3');
  });

  it('parses AlmaLinux', () => {
    const r = detect({ os: 'AlmaLinux 9.4 (Seafoam Ocelot)' });
    expect(r.platform).toBe('alma');
  });

  it('parses Alpine', () => {
    const r = detect({ os: 'Alpine Linux 3.19.1' });
    expect(r.platform).toBe('alpine');
  });

  it('parses Arch Linux', () => {
    const r = detect({ os: 'Arch Linux' });
    expect(r.platform).toBe('arch');
  });

  it('falls back to generic linux on unknown distro', () => {
    const r = detect({ os: 'Gentoo Base System release 2.15' });
    expect(r.platform).toBe('linux');
  });
});

// ─── Edge cases ─────────────────────────────────

describe('edge cases', () => {
  it('handles null dockerInfo', () => {
    const r = detect(null);
    expect(r.platform).toBe('linux');
  });

  it('handles missing fields', () => {
    const r = detect({});
    expect(r.platform).toBe('linux');
  });

  it('handles OperatingSystem field (capital O) as fallback', () => {
    const r = detect({ OperatingSystem: 'Ubuntu 24.04 LTS' });
    expect(r.platform).toBe('ubuntu');
  });
});

// ─── Cloud DMI detection (v6.12.1) ──────────────

describe('detectFromDmi — public cloud', () => {
  const { detectFromDmi } = platformDetect;

  it('recognizes AWS EC2', () => {
    const r = detectFromDmi('Amazon EC2', 't3.micro');
    expect(r.vendor).toBe('aws');
    expect(r.label).toBe('AWS EC2');
  });

  it('recognizes GCE via sys_vendor', () => {
    const r = detectFromDmi('Google', 'Google Compute Engine');
    expect(r.vendor).toBe('gce');
    expect(r.label).toBe('Google Cloud');
  });

  it('recognizes GCE via product_name when vendor is generic', () => {
    const r = detectFromDmi('Google', 'Google Compute Engine');
    expect(r.vendor).toBe('gce');
  });

  it('recognizes Azure', () => {
    const r = detectFromDmi('Microsoft Corporation', 'Virtual Machine');
    expect(r.vendor).toBe('azure');
    expect(r.label).toBe('Azure VM');
  });

  it('distinguishes Azure from generic Microsoft (no Virtual Machine product)', () => {
    const r = detectFromDmi('Microsoft Corporation', 'Surface Pro');
    expect(r.vendor).not.toBe('azure');
  });

  it('recognizes DigitalOcean via vendor', () => {
    const r = detectFromDmi('DigitalOcean', 'Droplet');
    expect(r.vendor).toBe('do');
  });

  it('recognizes DigitalOcean via product when vendor is empty', () => {
    const r = detectFromDmi('', 'Droplet');
    expect(r.vendor).toBe('do');
  });

  it('recognizes Hetzner', () => {
    const r = detectFromDmi('Hetzner', 'vServer');
    expect(r.vendor).toBe('hetzner');
  });

  it('recognizes Linode', () => {
    const r = detectFromDmi('Linode', '');
    expect(r.vendor).toBe('linode');
  });

  it('recognizes Vultr', () => {
    const r = detectFromDmi('Vultr', 'Cloud Compute');
    expect(r.vendor).toBe('vultr');
  });

  it('recognizes Oracle Cloud', () => {
    const r = detectFromDmi('Oracle Corporation', 'VM.Standard2.1');
    expect(r.vendor).toBe('oci');
  });

  it('does NOT match VirtualBox as Oracle Cloud', () => {
    const r = detectFromDmi('Oracle Corporation', 'VirtualBox');
    expect(r.vendor).toBe('virtualbox');
  });

  it('recognizes Scaleway', () => {
    const r = detectFromDmi('Scaleway', 'SCW-START1-XS');
    expect(r.vendor).toBe('scaleway');
  });
});

describe('detectFromDmi — virtualization', () => {
  const { detectFromDmi } = platformDetect;

  it('recognizes VMware', () => {
    const r = detectFromDmi('VMware, Inc.', 'VMware Virtual Platform');
    expect(r.vendor).toBe('vmware');
  });

  it('recognizes VirtualBox', () => {
    const r = detectFromDmi('innotek GmbH', 'VirtualBox');
    expect(r.vendor).toBe('virtualbox');
  });

  it('recognizes Xen (paravirt AWS-style)', () => {
    const r = detectFromDmi('Xen', 'HVM domU');
    expect(r.vendor).toBe('xen');
  });

  it('recognizes KVM/QEMU generic', () => {
    const r = detectFromDmi('QEMU', 'Standard PC (i440FX + PIIX, 1996)');
    expect(r.vendor).toBe('kvm');
  });

  it('recognizes Parallels', () => {
    const r = detectFromDmi('Parallels International GmbH', 'Parallels Virtual Platform');
    expect(r.vendor).toBe('parallels');
  });
});

describe('detectFromDmi — bare metal / edge', () => {
  const { detectFromDmi } = platformDetect;

  it('returns baremetal with raw vendor for unrecognized sys_vendor', () => {
    const r = detectFromDmi('Dell Inc.', 'PowerEdge R730');
    expect(r.vendor).toBe('baremetal');
    expect(r.label).toBe('Dell Inc.');
    expect(r.raw.product_name).toBe('PowerEdge R730');
  });

  it('returns null when both fields are empty', () => {
    expect(detectFromDmi('', '')).toBeNull();
    expect(detectFromDmi(null, null)).toBeNull();
    expect(detectFromDmi(undefined, undefined)).toBeNull();
  });

  it('trims whitespace from DMI strings', () => {
    const r = detectFromDmi('  Amazon EC2\n', ' t3.small\n');
    expect(r.vendor).toBe('aws');
    expect(r.raw.sys_vendor).toBe('Amazon EC2');
  });
});

describe('peekCloud cache semantics', () => {
  beforeEach(() => platformDetect.invalidate());

  it('returns undefined when not probed', () => {
    expect(platformDetect.peekCloud(42)).toBeUndefined();
  });
});

// ─── Cache behavior ─────────────────────────────

describe('cache', () => {
  beforeEach(() => platformDetect.invalidate());

  it('caches + returns same result', () => {
    const info = { os: 'DSM 7.2-64570' };
    const r1 = platformDetect.detectForHost(1, info);
    const r2 = platformDetect.detectForHost(1, info);
    expect(r1).toBe(r2);  // cached — same object ref
  });

  it('invalidate(id) clears one entry', () => {
    platformDetect.detectForHost(1, { os: 'DSM 7.2' });
    platformDetect.detectForHost(2, { os: 'Unraid 6.12' });
    platformDetect.invalidate(1);
    expect(platformDetect.peek(1)).toBeNull();
    expect(platformDetect.peek(2)).not.toBeNull();
  });

  it('invalidate() clears everything', () => {
    platformDetect.detectForHost(1, { os: 'DSM 7.2' });
    platformDetect.detectForHost(2, { os: 'Ubuntu 22.04' });
    platformDetect.invalidate();
    expect(platformDetect.peek(1)).toBeNull();
    expect(platformDetect.peek(2)).toBeNull();
  });
});
