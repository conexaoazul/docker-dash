---
title: Docker Storage Drivers
summary: Understand overlay2, btrfs, zfs storage drivers and their performance characteristics.
category: performance
difficulty: advanced
icon: fas fa-hdd
---

<h2>Docker Storage Drivers</h2>
<p>Storage drivers manage how image layers are stored and stacked on disk. The choice affects performance, stability, and available features.</p>

<h3>Check Your Current Driver</h3>
<pre><code>docker info | grep "Storage Driver"</code></pre>

<h3>overlay2 — The Default and Recommended Choice</h3>
<p>Works on any Linux kernel 4.0+ with ext4 or xfs filesystems. Uses Linux's OverlayFS to efficiently stack image layers. Best performance for most workloads.</p>
<ul>
  <li>Supported on: Ubuntu, Debian, CentOS 8+, Fedora, RHEL 8+</li>
  <li>Requires: <code>d_type=true</code> on XFS (verify with <code>xfs_info / | grep ftype</code>)</li>
</ul>

<h3>btrfs</h3>
<p>Uses Btrfs filesystem's native snapshotting. Good performance for write-heavy workloads. Requires the host filesystem to be Btrfs.</p>
<pre><code>mkfs.btrfs /dev/sdb
mount /dev/sdb /var/lib/docker</code></pre>

<h3>zfs</h3>
<p>Uses ZFS native snapshots and send/receive. Excellent for data integrity and deduplication. Higher memory usage than overlay2.</p>

<h3>devicemapper (Legacy — Avoid)</h3>
<p>Older driver, deprecated in Docker 20.10+. Poor performance in loopback mode. Avoid on new installations.</p>

<h3>When to Change Storage Drivers</h3>
<ul>
  <li><strong>Stay on overlay2</strong> for the vast majority of use cases</li>
  <li><strong>Consider btrfs/zfs</strong> only if your host already runs those filesystems and you need their advanced features</li>
  <li>Changing storage drivers requires deleting all existing images and containers</li>
</ul>
