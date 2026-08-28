import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { spawnSshTunnel } from '../src/server/sshTunnel';

describe('Tunnel Subsystem Suite', () => {
  test('spawnSshTunnel times out cleanly when ssh target is unreachable or invalid', async () => {
    const invalidArgs = ['-o', 'ConnectTimeout=1', 'invalid-non-existent-host.local'];
    const regex = /https:\/\/[a-z0-9]+\.link/;
    const res = await spawnSshTunnel(invalidArgs, regex, 500);
    assert.strictEqual(res, null);
  });
});
