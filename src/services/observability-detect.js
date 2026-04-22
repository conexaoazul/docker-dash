'use strict';

// Observability stack detection — v7.2.0
//
// Scans the local Docker daemon for running Prometheus / Grafana
// containers. Used by the in-app wizard at /system/observability to
// decide which of the three UX branches to render:
//   (A) both found → integration path (scrape config + dashboard import)
//   (B) one found  → partial-stack guidance
//   (C) none found → deploy-ours guidance
//
// Pure detection — never modifies Docker state, never throws, logs a
// warn on unexpected errors and returns null slots. Admin-gated at the
// route layer so this runs only from the wizard page.

const log = require('../utils/logger')('obs-detect');

// Image-name prefixes we recognize. Users who run renamed images (private
// mirror, custom tag) aren't detected — acceptable edge case; they already
// know what monitoring they have and can use the manual-entry path.
const PROMETHEUS_IMAGE_PATTERNS = [
  'prom/prometheus',
  'prometheus-community/',
  'bitnami/prometheus',
];

const GRAFANA_IMAGE_PATTERNS = [
  'grafana/grafana',
  'grafana/grafana-enterprise',
  'bitnami/grafana',
];

function _matchesAny(image, patterns) {
  const lower = String(image || '').toLowerCase();
  return patterns.some(p => lower.startsWith(p));
}

function _cleanName(names) {
  if (!Array.isArray(names) || names.length === 0) return '';
  return String(names[0] || '').replace(/^\//, '');
}

function _containerPort(ports, internalPort) {
  if (!Array.isArray(ports)) return null;
  const found = ports.find(p => p.PrivatePort === internalPort && p.PublicPort);
  return found ? found.PublicPort : null;
}

/**
 * Detect running Prometheus + Grafana containers on the local Docker daemon.
 *
 * @param {object} dockerService - the project's dockerService (src/services/docker.js)
 * @returns {Promise<{
 *   prometheus: null | {containerId, name, image, internalUrl, externalPort},
 *   grafana:    null | {containerId, name, image, internalUrl, externalPort},
 *   dockerDashContainerId: null | string,
 * }>}
 */
async function detect(dockerService) {
  const result = {
    prometheus: null,
    grafana: null,
    dockerDashContainerId: null,
  };

  let containers = [];
  try {
    const docker = dockerService.getDocker(0);
    containers = await docker.listContainers({ all: false });
  } catch (err) {
    log.warn('listContainers failed during detection', { message: err.message });
    return result;
  }

  for (const c of containers) {
    const name = _cleanName(c.Names);
    const image = c.Image || '';

    if (!result.prometheus && _matchesAny(image, PROMETHEUS_IMAGE_PATTERNS)) {
      result.prometheus = {
        containerId: (c.Id || '').substring(0, 12),
        name,
        image,
        // Internal URL is what OTHER containers on the same Docker network
        // would use. The wizard shows this in the scrape-config snippet.
        internalUrl: name ? `http://${name}:9090` : null,
        // External port (host-published) — shown if the user wants to hit
        // Prometheus from a browser. null if not exposed.
        externalPort: _containerPort(c.Ports, 9090),
      };
    }

    if (!result.grafana && _matchesAny(image, GRAFANA_IMAGE_PATTERNS)) {
      result.grafana = {
        containerId: (c.Id || '').substring(0, 12),
        name,
        image,
        internalUrl: name ? `http://${name}:3000` : null,
        externalPort: _containerPort(c.Ports, 3000),
      };
    }

    // Identify our own container so the scrape-config snippet uses the
    // correct target name. Falls back to 'app' (the compose service name).
    if (!result.dockerDashContainerId && /docker-dash(?!-redis|-prometheus|-grafana|-caddy)/.test(name)) {
      result.dockerDashContainerId = (c.Id || '').substring(0, 12);
    }
  }

  log.debug('Detection result', {
    prometheus: result.prometheus?.name || null,
    grafana: result.grafana?.name || null,
    self: result.dockerDashContainerId || null,
  });

  return result;
}

module.exports = {
  detect,
  _internals: { PROMETHEUS_IMAGE_PATTERNS, GRAFANA_IMAGE_PATTERNS, _matchesAny, _cleanName, _containerPort },
};
