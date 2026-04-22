# Platform Detection Reference

**Introduced:** v6.12.0 (NAS/Linux) + v6.12.1 (cloud/hypervisor via DMI)  
**Source:** [`src/services/platform-detect.js`](../../src/services/platform-detect.js)  
**Exposed via:** `GET /api/hosts/:id/info`

---

## Overview

Platform detection automatically identifies the host OS and infrastructure type — NAS appliance, cloud VM, hypervisor guest, or plain Linux — from two data sources:

1. **Docker info** (`docker info`) — available for every connected host with no extra probes. Used to detect NAS platforms (Synology DSM, Unraid, TrueNAS, QNAP, OpenMediaVault) and generic Linux distributions.
2. **DMI files** (`/sys/class/dmi/id/`) — read from the host filesystem (local: direct read; remote: SSH exec via the v6.8.0 tunnel). Used to detect cloud providers and hypervisors.

The result is a normalized object used to render a colored, branded badge on the Multi-Host card and Host Info panel.

---

## Detection Flow

```
GET /api/hosts/:id/info
        │
        ├─► detectForHost(id, dockerInfo)       ← NAS + Linux distro (docker info only)
        │       └─ regex chain on OperatingSystem / KernelVersion / Name fields
        │
        └─► probeCloudForHost(id)               ← cloud + hypervisor (DMI files)
                └─ read /sys/class/dmi/id/sys_vendor
                └─ read /sys/class/dmi/id/product_name
                └─ match against _CLOUD_SIGNATURES[]
```

Both probes are **cached per host ID**. The regex chain is cheap enough to run per-request, but caching avoids redundant DMI file reads on repeated page renders.

---

## NAS Platform Detection

Detected from `docker info`'s `OperatingSystem`, `KernelVersion`, and `Name` (hostname) fields.

| Platform | `platform` value | Detection marker | Notes |
|----------|-----------------|------------------|-------|
| **Synology DSM** | `synology` | `OperatingSystem` matches `/(?:Synology\s+)?DSM\s+[\d.-]+/i` | Version extracted (e.g. `7.2-64570 Update 3`) |
| **Unraid** | `unraid` | `OperatingSystem` or `KernelVersion` matches `/unraid/i`; or hostname is `tower` + Slackware marker | Version extracted if present |
| **TrueNAS SCALE** | `truenas` | `OperatingSystem` or `KernelVersion` matches `/truenas/i` | Electric Eel (24.10+) uses Docker; earlier SCALE used K3s |
| **QNAP** | `qnap` | `OperatingSystem` or `KernelVersion` matches `/QTS\|QuTS\|QNAP/i` | Container Station wraps Docker |
| **OpenMediaVault** | `omv` | `OperatingSystem` or hostname matches `/openmediavault/i` | See Limitations |

If none of the NAS patterns match, the service falls through to generic Linux distro detection (Ubuntu, Debian, Fedora, CentOS, Rocky, AlmaLinux, Alpine, Red Hat, Arch, openSUSE).

---

## Cloud & Hypervisor Detection

Detected from DMI files. The matching table is defined in the `_CLOUD_SIGNATURES` constant in [`src/services/platform-detect.js`](../../src/services/platform-detect.js).

### Signature shape

Each entry in `_CLOUD_SIGNATURES` is:

```js
{
  match: (v) => /* predicate over { vendor, product } */,
  vendor: 'string-key',
  label: 'Human label',
  iconClass: 'font-awesome-class',
  color: '#hexcolor',
}
```

Where `v.vendor` = contents of `/sys/class/dmi/id/sys_vendor` and `v.product` = `/sys/class/dmi/id/product_name`.

### Detected providers

**Public cloud:**

| Label | `vendor` key | Match condition |
|-------|-------------|-----------------|
| AWS EC2 | `aws` | `sys_vendor` matches `/amazon\s*ec2/i` |
| Google Cloud | `gce` | `sys_vendor` matches `/google/i` OR `product_name` matches `/google\s+compute/i` |
| Azure VM | `azure` | `sys_vendor` matches `/microsoft/i` AND `product_name` matches `/virtual\s+machine/i` |
| DigitalOcean | `do` | `sys_vendor` or `product_name` matches `/digitalocean\|droplet/i` |
| Hetzner | `hetzner` | `sys_vendor` or `product_name` matches `/hetzner/i` |
| Linode | `linode` | `sys_vendor` or `product_name` matches `/linode/i` |
| Vultr | `vultr` | `sys_vendor` or `product_name` matches `/vultr/i` |
| Oracle Cloud | `oci` | `sys_vendor` matches `/oracle/i` AND `product_name` does NOT match `/virtualbox/i` |
| Scaleway | `scaleway` | `sys_vendor` or `product_name` matches `/scaleway/i` |
| OVHcloud | `ovh` | `sys_vendor` or `product_name` matches `/ovh/i` |

**On-prem virtualization / homelab:**

| Label | `vendor` key | Match condition |
|-------|-------------|-----------------|
| VMware | `vmware` | `sys_vendor` or `product_name` matches `/vmware/i` |
| VirtualBox | `virtualbox` | `sys_vendor` matches `/innotek\|virtualbox/i` OR `product_name` matches `/virtualbox/i` |
| Xen | `xen` | `sys_vendor` matches `/xen/i` OR `product_name` matches `/hvm\s+domu/i` |
| KVM/QEMU | `kvm` | `sys_vendor` matches `/qemu/i` |
| Parallels | `parallels` | `sys_vendor` matches `/parallels/i` |

If DMI files are readable but no signature matches, the service returns `vendor: 'baremetal'` with the raw `sys_vendor` string as the label, so users can at least see their motherboard manufacturer.

---

## Return Shape

Both `detectForHost` and `probeCloudForHost` return a normalized object:

```js
// NAS / Linux result (detectForHost)
{
  platform: 'synology',        // string key
  label: 'Synology DSM',       // display label
  version: '7.2-64570 Update 3',
  category: 'nas',             // 'nas' | 'linux'
  iconClass: 'fas fa-hdd',     // Font Awesome class
  color: '#11457e',            // hex brand color
  notes: '...',                // optional admin hint (NAS platforms only)
}

// Cloud / hypervisor result (probeCloudForHost)
{
  vendor: 'hetzner',
  label: 'Hetzner',
  iconClass: 'fas fa-cloud',
  color: '#d50c2d',
  raw: { sys_vendor: 'Hetzner', product_name: 'HCloud' },
}
```

---

## Cache Behavior

| Function | Cache | Invalidation |
|----------|-------|-------------|
| `detectForHost(hostId, dockerInfo)` | `_cache` (Map, by hostId) | `invalidate(hostId)` or `invalidate()` for all |
| `probeCloudForHost(hostId)` | `_cloudCache` (Map, by hostId) | same `invalidate()` call |
| `peek(hostId)` | read-only | — |
| `peekCloud(hostId)` | returns `undefined` if not yet probed (distinct from `null` = probed but unreadable) | — |

Cache is invalidated automatically on tunnel reconnect events. You can also force a refresh by reconnecting the host in the UI.

---

## UI Badge

The Multi-Host card renders a badge using the `label`, `iconClass`, and `color` from the detection result. Two badges can appear simultaneously: one for the OS/NAS type (from docker info) and one for the cloud/hypervisor layer (from DMI), since a Synology DSM running in a VMware lab is a valid combination — though unusual.

---

## How to Extend

To add a new cloud provider or hypervisor, append an entry to `_CLOUD_SIGNATURES` in [`src/services/platform-detect.js`](../../src/services/platform-detect.js):

```js
const _CLOUD_SIGNATURES = [
  // ... existing entries ...

  // Example: Exoscale
  {
    match: v => /exoscale/i.test(v.vendor) || /exoscale/i.test(v.product),
    vendor: 'exoscale',
    label: 'Exoscale',
    iconClass: 'fas fa-cloud',
    color: '#da291c',
  },
];
```

The `match` function receives `{ vendor: string, product: string }`. Return `true` to claim the match. Entries are evaluated in order — place more specific matches before more generic ones.

For a new NAS platform, add a new conditional block in `detectFromDockerInfo()` before the `_detectGenericLinux()` fallthrough, following the same `return { platform, label, version, category, iconClass, color, notes }` shape.

---

## Known Limitations

- **OMV detection relies on hostname.** OpenMediaVault is Debian-based; its `docker info` `OperatingSystem` reports `Debian GNU/Linux`. The service matches on `/openmediavault/i` in the hostname. If the admin has renamed the hostname, OMV will be silently classified as Debian.
- **QNAP version not extracted.** QTS version is not reliably present in `docker info` fields; the `version` field is left empty.
- **Generic QEMU = KVM.** Many providers (older Oracle shapes, Scaleway, some OVH setups, homelab Proxmox) report `QEMU` as the sys_vendor. The service maps this to `KVM/QEMU` because there is no reliable way to distinguish them without additional probes.
- **DMI not available in all containers.** In hardened or rootless Docker setups the `/sys/class/dmi/id/` path may be restricted. `probeCloudForHost` degrades silently to `null` in that case (cached as "probed but unreadable").
- **Synology DSM < 6.x.** Officially unsupported by Docker; detection may work but is not tested.
- **TrueNAS SCALE < 24.10.** Earlier SCALE versions used K3s, not Docker; connections will fail at the Docker socket level before platform detection runs.

---

## See Also

- Source: [`src/services/platform-detect.js`](../../src/services/platform-detect.js)
- Route: `GET /api/hosts/:id/info` in [`src/routes/hosts.js`](../../src/routes/hosts.js)
- CHANGELOG: v6.12.0, v6.12.1 entries
- Related: [`docs/features/prometheus-metrics.md`](./prometheus-metrics.md)
