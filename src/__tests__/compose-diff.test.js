'use strict';

// Tests for src/services/compose-diff.js (v6.6)

process.env.APP_ENV = 'test';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'test-encryption-key-for-jest-32chars';

const { diffYamlStrings, applyPatch } = require('../services/compose-diff');
const YAML = require('yaml');

const BASE = `version: "3.8"

services:
  api:
    image: myapp/api:1.2.3
    privileged: true
    environment:
      - DB_HOST=db
    depends_on:
      - db

  db:
    image: postgres:16-alpine

volumes:
  db-data:
`;

describe('compose-diff — applyPatch', () => {
  it('deletes a key when patch value is null', () => {
    const doc = YAML.parseDocument(BASE);
    applyPatch(doc.getIn(['services', 'api'], true), { privileged: null });
    const out = String(doc);
    expect(out).not.toMatch(/privileged: true/);
  });

  it('adds a new scalar key', () => {
    const doc = YAML.parseDocument(BASE);
    applyPatch(doc.getIn(['services', 'api'], true), { mem_limit: '512m' });
    const out = String(doc);
    expect(out).toMatch(/mem_limit: 512m/);
  });

  it('list surgery via $add appends unique items', () => {
    const doc = YAML.parseDocument(BASE);
    applyPatch(doc.getIn(['services', 'api'], true), { security_opt: { $add: ['no-new-privileges:true'] } });
    const out = String(doc);
    expect(out).toMatch(/security_opt:/);
    expect(out).toMatch(/no-new-privileges:true/);
  });

  it('list surgery via $add does not duplicate existing items', () => {
    const src = `services:
  api:
    image: x
    security_opt:
      - no-new-privileges:true
      - seccomp:unconfined
`;
    const doc = YAML.parseDocument(src);
    applyPatch(doc.getIn(['services', 'api'], true), { security_opt: { $add: ['no-new-privileges:true'] } });
    const out = String(doc);
    const matches = out.match(/no-new-privileges:true/g) || [];
    expect(matches.length).toBe(1);
  });

  it('list surgery via $remove deletes matching items', () => {
    const src = `services:
  api:
    image: x
    cap_add:
      - SYS_ADMIN
      - CHOWN
      - NET_ADMIN
`;
    const doc = YAML.parseDocument(src);
    applyPatch(doc.getIn(['services', 'api'], true), { cap_add: { $remove: ['SYS_ADMIN', 'NET_ADMIN'] } });
    const out = String(doc);
    expect(out).not.toMatch(/SYS_ADMIN/);
    expect(out).not.toMatch(/NET_ADMIN/);
    expect(out).toMatch(/CHOWN/);
  });

  it('nested merge preserves unmodified keys', () => {
    const doc = YAML.parseDocument(BASE);
    applyPatch(doc.getIn(['services', 'db'], true), {
      logging: { driver: 'json-file', options: { 'max-size': '10m' } },
    });
    const out = String(doc);
    expect(out).toMatch(/logging:/);
    expect(out).toMatch(/driver: json-file/);
    expect(out).toMatch(/max-size: 10m/);
    expect(out).toMatch(/image: postgres:16-alpine/);  // db.image preserved
  });
});

describe('compose-diff — diffYamlStrings', () => {
  it('produces a unified diff with added/removed lines', () => {
    const { unified, before, after } = diffYamlStrings(BASE, {
      api: { privileged: null, mem_limit: '512m' },
    });
    expect(before).toBe(BASE);
    expect(after).not.toBe(BASE);
    expect(unified).toMatch(/^---/m);
    expect(unified).toMatch(/^\+\+\+/m);
    expect(unified).toMatch(/^-.*privileged/m);
    expect(unified).toMatch(/^\+.*mem_limit/m);
  });

  it('throws if service not found', () => {
    expect(() => diffYamlStrings(BASE, { notaservice: { foo: 'bar' } }))
      .toThrow(/Service 'notaservice' not found/);
  });

  it('no-op patch produces empty-ish diff', () => {
    const { unified } = diffYamlStrings(BASE, { api: {} });
    // The unified diff header is present, but no actual hunk
    expect(unified.split('\n').filter(l => l.startsWith('+') || l.startsWith('-')).length).toBeLessThan(4);
  });

  it('preserves the rest of the file untouched', () => {
    const { after } = diffYamlStrings(BASE, { api: { privileged: null } });
    expect(after).toMatch(/db:/);
    expect(after).toMatch(/image: postgres:16-alpine/);
    expect(after).toMatch(/volumes:/);
    expect(after).toMatch(/db-data:/);
  });
});
