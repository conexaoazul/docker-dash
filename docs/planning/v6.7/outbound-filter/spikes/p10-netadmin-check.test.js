'use strict';

// Unit tests for the P10 spike. Will graduate to src/__tests__/ when v6.7
// enforcement lands.

const { canApplyFilter } = require('./p10-netadmin-check');

const makeInspect = (hc = {}) => ({
  HostConfig: { NetworkMode: 'bridge', Privileged: false, CapAdd: [], ...hc },
});

describe('P10 — canApplyFilter', () => {
  it('allows a default bridge container', () => {
    const r = canApplyFilter(makeInspect());
    expect(r.ok).toBe(true);
  });

  it('refuses privileged containers', () => {
    const r = canApplyFilter(makeInspect({ Privileged: true }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/privileged mode/i);
  });

  it('refuses containers with NET_ADMIN', () => {
    const r = canApplyFilter(makeInspect({ CapAdd: ['NET_ADMIN'] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/NET_ADMIN/);
  });

  it('refuses containers with SYS_ADMIN', () => {
    const r = canApplyFilter(makeInspect({ CapAdd: ['SYS_ADMIN'] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/SYS_ADMIN/);
  });

  it('refuses network_mode=host', () => {
    const r = canApplyFilter(makeInspect({ NetworkMode: 'host' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/host/);
  });

  it('refuses network_mode=none (no filter needed)', () => {
    const r = canApplyFilter(makeInspect({ NetworkMode: 'none' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/already has no network access/);
  });

  it('refuses network_mode=container:<id>', () => {
    const r = canApplyFilter(makeInspect({ NetworkMode: 'container:abc123' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/shares its network namespace/);
  });

  it('allows container with benign caps like SYS_NICE', () => {
    const r = canApplyFilter(makeInspect({ CapAdd: ['SYS_NICE', 'CHOWN'] }));
    expect(r.ok).toBe(true);
  });

  it('combines: privileged wins even if caps look OK', () => {
    const r = canApplyFilter(makeInspect({ Privileged: true, CapAdd: ['CHOWN'] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/privileged/i);
  });
});
