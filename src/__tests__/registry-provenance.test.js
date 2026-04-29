'use strict';

// Tests for src/services/registry-provenance.js (v8.1.0)
//
// Pure-function parser — no I/O, no DB, no network. Each test is small
// and focused on a single behavior.

const provenance = require('../services/registry-provenance');
const { parse } = provenance;

describe('registry-provenance — parse()', () => {
  describe('empty / malformed input', () => {
    it('parse(null) returns empty result with hasProvenance=false', () => {
      const r = parse(null);
      expect(r).toEqual({ hasProvenance: false, known: {}, other: {}, otherCount: 0, totalAnnotations: 0 });
    });

    it('parse({}) and parse({ manifest: {} }) both return empty', () => {
      expect(parse({})).toEqual({ hasProvenance: false, known: {}, other: {}, otherCount: 0, totalAnnotations: 0 });
      expect(parse({ manifest: {} })).toEqual({ hasProvenance: false, known: {}, other: {}, otherCount: 0, totalAnnotations: 0 });
    });

    it('treats annotations:[] (array) as empty without throwing', () => {
      const r = parse({ annotations: [] });
      expect(r.hasProvenance).toBe(false);
      expect(r.totalAnnotations).toBe(0);
      expect(r.known).toEqual({});
      expect(r.other).toEqual({});
    });
  });

  describe('input shape', () => {
    it('accepts wrapped input ({ manifest: { annotations } }) the same as raw', () => {
      const annotations = { 'org.opencontainers.image.title': 'demo' };
      const wrapped = parse({ manifest: { annotations } });
      const raw = parse({ annotations });
      expect(wrapped).toEqual(raw);
      expect(wrapped.known.title).toBe('demo');
    });
  });

  describe('known annotations', () => {
    it('surfaces all 12 KNOWN_KEYS as named fields with hasProvenance=true', () => {
      const annotations = {
        'org.opencontainers.image.source':        'https://github.com/owner/repo',
        'org.opencontainers.image.revision':      'abc123',
        'org.opencontainers.image.created':       '2026-01-01T00:00:00Z',
        'org.opencontainers.image.authors':       'Bogdan',
        'org.opencontainers.image.licenses':      'MIT',
        'org.opencontainers.image.url':           'https://github.com/owner/repo',
        'org.opencontainers.image.documentation': 'https://github.com/owner/repo/blob/main/README.md',
        'org.opencontainers.image.vendor':        'All4Labels',
        'org.opencontainers.image.version':       '8.1.0',
        'org.opencontainers.image.title':         'docker-dash',
        'org.opencontainers.image.description':   'Self-hosted Docker dashboard',
        'org.opencontainers.image.base.name':     'node:20-alpine',
      };
      const r = parse({ annotations });
      expect(r.hasProvenance).toBe(true);
      expect(r.known.source).toBe('https://github.com/owner/repo');
      expect(r.known.revision).toBe('abc123');
      expect(r.known.created).toBe('2026-01-01T00:00:00Z');
      expect(r.known.authors).toBe('Bogdan');
      expect(r.known.licenses).toBe('MIT');
      expect(r.known.url).toBe('https://github.com/owner/repo');
      expect(r.known.documentation).toBe('https://github.com/owner/repo/blob/main/README.md');
      expect(r.known.vendor).toBe('All4Labels');
      expect(r.known.version).toBe('8.1.0');
      expect(r.known.title).toBe('docker-dash');
      expect(r.known.description).toBe('Self-hosted Docker dashboard');
      expect(r.known.baseName).toBe('node:20-alpine');
      expect(r.otherCount).toBe(0);
    });
  });

  describe('source linkification', () => {
    it('linkifies github.com sources', () => {
      const r = parse({ annotations: { 'org.opencontainers.image.source': 'https://github.com/owner/repo' } });
      expect(r.known.sourceLink).toBe('https://github.com/owner/repo');
    });

    it('linkifies gitlab/bitbucket/codeberg/gitea sources', () => {
      const hosts = [
        'https://gitlab.com/g/p',
        'https://bitbucket.org/g/p',
        'https://codeberg.org/g/p',
        'https://gitea.com/g/p',
      ];
      for (const url of hosts) {
        const r = parse({ annotations: { 'org.opencontainers.image.source': url } });
        expect(r.known.sourceLink).toBe(url);
      }
    });

    it('does NOT linkify unknown hosts (sourceLink=null, source preserved)', () => {
      const r = parse({ annotations: { 'org.opencontainers.image.source': 'https://random-vcs.example.com/repo' } });
      expect(r.known.source).toBe('https://random-vcs.example.com/repo');
      expect(r.known.sourceLink).toBeNull();
    });

    it('does NOT throw on malformed URL — returns sourceLink=null', () => {
      const r = parse({ annotations: { 'org.opencontainers.image.source': 'not a url at all' } });
      expect(r.known.source).toBe('not a url at all');
      expect(r.known.sourceLink).toBeNull();
    });
  });

  describe('revision', () => {
    it('exposes full revision and a 10-char short form', () => {
      const full = 'abc123def456789012345678';
      const r = parse({ annotations: { 'org.opencontainers.image.revision': full } });
      expect(r.known.revision).toBe(full);
      expect(r.known.revisionShort).toBe('abc123def4');
      expect(r.known.revisionShort.length).toBe(10);
    });
  });

  describe('cosign signatures', () => {
    it('detects cosign via dev.sigstore.cosign.* annotation key', () => {
      const r = parse({ annotations: { 'dev.sigstore.cosign.v1.signature': 'MEUCIQ...' } });
      expect(r.known.signed).toBe(true);
    });

    it('detects cosign via sig.cosign.dev/* annotation key', () => {
      const r = parse({ annotations: { 'sig.cosign.dev/cert-identity': 'me@example.com' } });
      expect(r.known.signed).toBe(true);
    });

    it('extracts signer from dev.sigstore.cosign.v1.signer', () => {
      const r = parse({ annotations: { 'dev.sigstore.cosign.v1.signer': 'x509@github.com/foo' } });
      expect(r.known.signed).toBe(true);
      expect(r.known.signer).toBe('x509@github.com/foo');
    });

    it('detects signed=true on old-style array `signatures` field on the manifest', () => {
      const r = parse({ manifest: { signatures: [{ header: {}, signature: 'sig' }] } });
      expect(r.known.signed).toBe(true);
    });
  });

  describe('other / totalAnnotations bucketing', () => {
    it('buckets unknown keys into other; cosign keys are excluded from other but counted in totalAnnotations', () => {
      const annotations = {
        'org.opencontainers.image.title': 'demo',          // known
        'com.example.custom.foo':         'bar',            // other
        'com.example.custom.baz':         'qux',            // other
        'dev.sigstore.cosign.v1.signature': 'MEUCIQ...',   // cosign — not in `other`
      };
      const r = parse({ annotations });
      expect(r.other).toEqual({ 'com.example.custom.foo': 'bar', 'com.example.custom.baz': 'qux' });
      expect(r.otherCount).toBe(2);
      // totalAnnotations counts EVERY key on annotations, including the cosign one
      expect(r.totalAnnotations).toBe(4);
      expect(r.known.title).toBe('demo');
      expect(r.known.signed).toBe(true);
    });
  });
});
