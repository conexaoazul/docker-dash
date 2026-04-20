'use strict';

// P10 spike — NET_ADMIN / SYS_ADMIN / privileged precondition check.
//
// A container that has NET_ADMIN (or SYS_ADMIN, which implies it) can modify
// its own netns's nftables rules — so our filter is toothless against it.
// Same for privileged=true. We refuse to attach a filter to such containers
// at policy-create time, returning 422 with a clear user-facing message.
//
// This is pure classification logic, same style as egress-audit.js.

const REFUSING_CAPS = new Set(['NET_ADMIN', 'SYS_ADMIN']);

/**
 * Decide whether an outbound filter can be applied to this container.
 *
 * @param {object} inspect - Raw `docker inspect` for one container
 * @returns {{ok: boolean, reason?: string}}
 */
function canApplyFilter(inspect) {
  const hc = inspect.HostConfig || {};

  if (hc.Privileged === true) {
    return {
      ok: false,
      reason: 'Container runs in privileged mode — it can modify its own iptables/nftables rules and bypass the filter. Drop privileged mode first, then re-apply the filter.',
    };
  }

  const caps = hc.CapAdd || [];
  for (const cap of caps) {
    if (REFUSING_CAPS.has(cap)) {
      return {
        ok: false,
        reason: `Container has capability ${cap} — it can modify its own iptables/nftables rules and bypass the filter. Drop this capability (via the Remediation Wizard or compose edit), then re-apply.`,
      };
    }
  }

  const networkMode = hc.NetworkMode || 'default';
  if (networkMode === 'host') {
    return {
      ok: false,
      reason: 'Container uses network_mode: host — it shares the host\'s network namespace, where we cannot install per-container filter rules. Switch to a bridge network, then re-apply.',
    };
  }

  if (networkMode === 'none') {
    return {
      ok: false,
      reason: 'Container uses network_mode: none — it already has no network access, so no filter is needed.',
    };
  }

  if (networkMode.startsWith('container:')) {
    return {
      ok: false,
      reason: `Container shares its network namespace with ${networkMode} — apply the filter to that container instead.`,
    };
  }

  return { ok: true };
}

module.exports = { canApplyFilter, _internals: { REFUSING_CAPS } };
