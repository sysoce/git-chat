import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { getDefaultIceServers, parseIceServers } from '../src/p2p/p2pIceConfig';

describe('P2P ICE Configuration Suite', () => {
  it('provides default public STUN servers', () => {
    const servers = getDefaultIceServers();
    assert.ok(Array.isArray(servers));
    assert.ok(servers.length >= 2);
    assert.ok(servers.some(s => typeof s.urls === 'string' ? s.urls.includes('google') : s.urls.some(u => u.includes('google'))));
  });

  it('parses custom ICE servers from JSON strings', () => {
    const custom = JSON.stringify([{ urls: 'stun:custom.stun.org:3478' }]);
    const parsed = parseIceServers(custom);
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].urls, 'stun:custom.stun.org:3478');
  });

  it('falls back to default ICE servers on invalid json input', () => {
    const parsed = parseIceServers('invalid-json');
    assert.ok(parsed.length >= 2);
  });
});
