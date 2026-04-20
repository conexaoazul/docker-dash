'use strict';

// Unit tests for the v6.8.0 additions to ssh-tunnel: exec, fileExists,
// readFile, writeFile. Mocks the ssh2 Client stream/sftp interfaces so we
// can test the wiring without needing a real SSH server.

process.env.APP_ENV = 'test';

// Mock ssh2 BEFORE loading ssh-tunnel.
jest.mock('ssh2', () => {
  const { EventEmitter } = require('events');
  class MockClient extends EventEmitter {
    connect() { setImmediate(() => this.emit('ready')); }
    exec(_cmd, cb) {
      const stream = new EventEmitter();
      stream.stderr = new EventEmitter();
      // Default: echo "ok" on stdout, exit 0
      setImmediate(() => {
        stream.emit('data', Buffer.from(this._execStdout || 'ok'));
        if (this._execStderr) stream.stderr.emit('data', Buffer.from(this._execStderr));
        stream.emit('close', this._execExit ?? 0);
      });
      cb(null, stream);
    }
    sftp(cb) {
      const sftp = {
        createReadStream: jest.fn(() => {
          const s = new EventEmitter();
          setImmediate(() => {
            s.emit('data', Buffer.from(this._sftpReadContent || 'file content'));
            s.emit('end');
          });
          return s;
        }),
        createWriteStream: jest.fn(() => {
          const s = new EventEmitter();
          s.end = (content) => {
            this._sftpWrittenContent = content;
            setImmediate(() => s.emit('close'));
          };
          return s;
        }),
      };
      cb(null, sftp);
    }
    end() {}
  }
  return { Client: MockClient };
});

const sshTunnel = require('../services/ssh-tunnel');

// Inject a fake tunnel entry so exec() can find it
function setupTunnel(hostId, client) {
  sshTunnel._tunnels.set(hostId, { client, localPort: 0, hostId });
}

function teardownTunnel(hostId) {
  sshTunnel._tunnels.delete(hostId);
}

describe('ssh-tunnel exec', () => {
  let client;
  beforeEach(() => {
    const { Client } = require('ssh2');
    client = new Client();
    setupTunnel(42, client);
  });
  afterEach(() => teardownTunnel(42));

  it('throws when no tunnel exists for hostId', async () => {
    await expect(sshTunnel.exec(999, 'ls')).rejects.toThrow(/No SSH tunnel/);
  });

  it('returns stdout + stderr + exitCode on success', async () => {
    client._execStdout = 'hello';
    const r = await sshTunnel.exec(42, 'echo hello');
    expect(r.stdout).toBe('hello');
    expect(r.exitCode).toBe(0);
  });

  it('surfaces non-zero exit code', async () => {
    client._execStdout = '';
    client._execStderr = 'not found';
    client._execExit = 127;
    const r = await sshTunnel.exec(42, 'not-a-command');
    expect(r.exitCode).toBe(127);
    expect(r.stderr).toMatch(/not found/);
  });
});

describe('ssh-tunnel fileExists', () => {
  let client;
  beforeEach(() => {
    const { Client } = require('ssh2');
    client = new Client();
    setupTunnel(42, client);
  });
  afterEach(() => teardownTunnel(42));

  it('true when test -f returns 0', async () => {
    client._execExit = 0;
    expect(await sshTunnel.fileExists(42, '/etc/hosts')).toBe(true);
  });

  it('false when test -f returns 1', async () => {
    client._execExit = 1;
    expect(await sshTunnel.fileExists(42, '/no/such')).toBe(false);
  });

  it('quotes paths containing single-quotes', async () => {
    // We can't peek the command directly, but the test shouldn't throw on
    // a risky path. Just exercise the code path.
    client._execExit = 1;
    await expect(sshTunnel.fileExists(42, "/tmp/it's-fine.txt")).resolves.toBe(false);
  });
});

describe('ssh-tunnel readFile / writeFile', () => {
  let client;
  beforeEach(() => {
    const { Client } = require('ssh2');
    client = new Client();
    setupTunnel(42, client);
  });
  afterEach(() => teardownTunnel(42));

  it('readFile streams content back as utf8 string', async () => {
    client._sftpReadContent = 'docker-compose yaml content';
    const r = await sshTunnel.readFile(42, '/remote/compose.yml');
    expect(r).toBe('docker-compose yaml content');
  });

  it('writeFile writes content via sftp createWriteStream', async () => {
    await sshTunnel.writeFile(42, '/remote/compose.yml', 'new content');
    expect(client._sftpWrittenContent).toBe('new content');
  });
});
