'use strict';

// Tests for src/services/remote-fs.js — local vs SSH dispatch (v6.8.0).

process.env.APP_ENV = 'test';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock ssh-tunnel; remote-fs is loaded after mock is set up.
jest.mock('../services/ssh-tunnel', () => ({
  exec: jest.fn(),
  fileExists: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

const sshTunnel = require('../services/ssh-tunnel');
const remoteFs = require('../services/remote-fs');

const TMP = path.join(os.tmpdir(), 'remote-fs-test-' + Date.now());

beforeAll(() => {
  fs.mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  try { fs.rmSync(TMP, { recursive: true, force: true }); } catch {}
});

beforeEach(() => {
  sshTunnel.fileExists.mockReset();
  sshTunnel.readFile.mockReset();
  sshTunnel.writeFile.mockReset();
});

// ─── Local (hostId = 0) paths use node fs ─────────

describe('hostId=0 routes to node fs', () => {
  const localPath = path.join(TMP, 'local.txt');

  it('fileExists returns true/false based on node fs', async () => {
    expect(await remoteFs.fileExists(0, localPath)).toBe(false);
    fs.writeFileSync(localPath, 'hello');
    expect(await remoteFs.fileExists(0, localPath)).toBe(true);
    expect(sshTunnel.fileExists).not.toHaveBeenCalled();
  });

  it('readFile returns node fs content', async () => {
    fs.writeFileSync(localPath, 'payload-xyz');
    expect(await remoteFs.readFile(0, localPath)).toBe('payload-xyz');
    expect(sshTunnel.readFile).not.toHaveBeenCalled();
  });

  it('writeFile writes via node fs', async () => {
    const p = path.join(TMP, 'write.txt');
    await remoteFs.writeFile(0, p, 'content-abc');
    expect(fs.readFileSync(p, 'utf8')).toBe('content-abc');
    expect(sshTunnel.writeFile).not.toHaveBeenCalled();
  });

  it('hostId undefined or null also routes local', async () => {
    expect(await remoteFs.fileExists(undefined, localPath)).toBe(true);
    expect(await remoteFs.fileExists(null, localPath)).toBe(true);
    expect(sshTunnel.fileExists).not.toHaveBeenCalled();
  });
});

// ─── Remote (hostId > 0) paths route through ssh-tunnel ─

describe('hostId>0 routes to ssh-tunnel', () => {
  it('fileExists delegates', async () => {
    sshTunnel.fileExists.mockResolvedValueOnce(true);
    expect(await remoteFs.fileExists(2, '/etc/compose.yml')).toBe(true);
    expect(sshTunnel.fileExists).toHaveBeenCalledWith(2, '/etc/compose.yml');
  });

  it('fileExists swallows ssh errors as false', async () => {
    sshTunnel.fileExists.mockRejectedValueOnce(new Error('tunnel down'));
    expect(await remoteFs.fileExists(3, '/etc/x')).toBe(false);
  });

  it('readFile delegates + bubbles errors', async () => {
    sshTunnel.readFile.mockResolvedValueOnce('remote content');
    expect(await remoteFs.readFile(4, '/etc/x')).toBe('remote content');

    sshTunnel.readFile.mockRejectedValueOnce(new Error('no such file'));
    await expect(remoteFs.readFile(4, '/etc/x')).rejects.toThrow(/no such file/);
  });

  it('writeFile delegates', async () => {
    sshTunnel.writeFile.mockResolvedValueOnce();
    await remoteFs.writeFile(5, '/etc/x', 'payload');
    expect(sshTunnel.writeFile).toHaveBeenCalledWith(5, '/etc/x', 'payload');
  });
});
