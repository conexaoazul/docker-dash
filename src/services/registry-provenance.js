'use strict';

// v8.1.0 — Build provenance parser.
//
// Pure function over an OCI manifest. No I/O, no DB, no network. Reads the
// `annotations` map (OCI image-spec) + signature blocks (cosign), returns
// a structured view the Browse page renders inline in the manifest-inspect
// modal.
//
// Critically: cosign signature presence is detected, NOT verified. Real
// crypto verification (calling `cosign verify` with a key) is deferred to
// v8.2.0+ — needs cosign binary handling, key management, additional UX.
// This release surfaces "Yes/No signed" only.

const KNOWN_KEYS = {
  'org.opencontainers.image.source':        'source',
  'org.opencontainers.image.revision':      'revision',
  'org.opencontainers.image.created':       'created',
  'org.opencontainers.image.authors':       'authors',
  'org.opencontainers.image.licenses':      'licenses',
  'org.opencontainers.image.url':           'url',
  'org.opencontainers.image.documentation': 'documentation',
  'org.opencontainers.image.vendor':        'vendor',
  'org.opencontainers.image.version':       'version',
  'org.opencontainers.image.title':         'title',
  'org.opencontainers.image.description':   'description',
  'org.opencontainers.image.base.name':     'baseName',
};

// Hosts we'll render as clickable links. Anything else stays as plain text.
const LINKABLE_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org', 'gitea.com'];

/**
 * Parse provenance metadata from a manifest payload.
 *
 * @param {object} manifestData  Either the raw manifest object, or a wrapper
 *                                {manifest, digest, contentType, ...} as returned
 *                                by registryService.manifest().
 * @returns {{
 *   hasProvenance: boolean,
 *   known: Object,           — recognized OCI annotations as named fields
 *   other: Object,           — every other annotation, key→value
 *   otherCount: number,
 *   totalAnnotations: number,
 * }}
 */
function parse(manifestData) {
  if (!manifestData || typeof manifestData !== 'object') return _empty();
  const m = manifestData.manifest || manifestData;
  const annotations = (m && m.annotations && typeof m.annotations === 'object' && !Array.isArray(m.annotations))
    ? m.annotations : {};

  const known = {};
  const other = {};

  for (const [k, v] of Object.entries(annotations)) {
    // Skip known cosign sig keys — we surface them via the `signed` field below
    if (k.startsWith('dev.sigstore.cosign') || k.startsWith('sig.cosign.dev/')) continue;
    if (KNOWN_KEYS[k]) {
      known[KNOWN_KEYS[k]] = String(v);
    } else {
      other[k] = String(v);
    }
  }

  // Add link-friendly versions for url-bearing fields
  if (known.source) known.sourceLink = _toLink(known.source);
  if (known.url) known.urlLink = _toLink(known.url);
  if (known.documentation) known.documentationLink = _toLink(known.documentation);

  // Truncate the commit SHA for display; UI shows the full one in tooltip
  if (known.revision) {
    known.revisionShort = known.revision.substring(0, 10);
  }

  // Detect cosign signature presence (no cryptographic verification — see v8.2.0)
  const hasCosign = Object.keys(annotations).some(
    k => k.startsWith('dev.sigstore.cosign') || k.startsWith('sig.cosign.dev/')
  ) || (Array.isArray(m.signatures) && m.signatures.length > 0);

  if (hasCosign) {
    known.signed = true;
    // Try to extract a signer identity for display (best-effort; cosign signers
    // can take many shapes — we surface whatever we find without parsing)
    const signerKey = Object.keys(annotations).find(k =>
      k === 'dev.sigstore.cosign.v1.signer'
      || k === 'sig.cosign.dev/cert-identity'
      || k === 'dev.sigstore.cosign.v1.cert-identity'
    );
    if (signerKey) known.signer = String(annotations[signerKey]);
  }

  return {
    hasProvenance: Object.keys(known).length > 0,
    known,
    other,
    otherCount: Object.keys(other).length,
    totalAnnotations: Object.keys(annotations).length,
  };
}

/**
 * Return the URL string only if its host is in our linkable allowlist.
 * Returns null otherwise so the UI renders plain text.
 */
function _toLink(url) {
  try {
    const u = new URL(url);
    if (LINKABLE_HOSTS.includes(u.hostname)) return url;
    return null;
  } catch {
    return null;
  }
}

function _empty() {
  return { hasProvenance: false, known: {}, other: {}, otherCount: 0, totalAnnotations: 0 };
}

module.exports = {
  parse,
  _internals: { KNOWN_KEYS, LINKABLE_HOSTS, _toLink },
};
