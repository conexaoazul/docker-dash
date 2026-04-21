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
