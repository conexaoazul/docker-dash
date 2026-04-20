'use strict';

// remote-fs — v6.8.0
//
// Thin dispatcher over local `fs` vs SSH-tunnel file ops. Callers pass a
// hostId; 0 (local) routes to node fs, >0 routes through ssh-tunnel.
//
// Design: keep the async signature uniform so callers can `await` either
// path. No throws on missing SSH tunnel when hostId=0 — a clean degradation
// path for code that runs before multi-host is initialized.
//
// NOT safe for user-supplied paths — callers must sanitize. SSH exec uses
// shell quoting for `test -f`; everything else goes through SFTP which
// is path-safe.

const fs = require('fs');
const sshTunnel = require('./ssh-tunnel');

async function fileExists(hostId, path) {
  if (!hostId || hostId === 0) return fs.existsSync(path);
  try {
    return await sshTunnel.fileExists(hostId, path);
  } catch {
    // Treat unreachable tunnel as "doesn't exist" so callers don't crash.
    return false;
  }
}

async function readFile(hostId, path) {
  if (!hostId || hostId === 0) return fs.readFileSync(path, 'utf8');
  return sshTunnel.readFile(hostId, path);
}

async function writeFile(hostId, path, content) {
  if (!hostId || hostId === 0) {
    fs.writeFileSync(path, content, 'utf8');
    return;
  }
  return sshTunnel.writeFile(hostId, path, content);
}

module.exports = { fileExists, readFile, writeFile };
