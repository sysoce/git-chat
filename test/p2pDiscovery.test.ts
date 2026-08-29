import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { P2PDiscovery } from '../src/p2p/p2pDiscovery.js';

describe('P2PDiscovery', () => {
  it('registers peers and announces presence', () => {
    const announced: string[] = [];
    const discovery = new P2PDiscovery({
      localPeerId: 'peer_local',
      onAnnounce: (id) => announced.push(id),
    });

    discovery.announce();
    assert.deepEqual(announced, ['peer_local']);
  });

  it('tracks remote peers and expires inactive peers', () => {
    const discovery = new P2PDiscovery({
      localPeerId: 'peer_local',
      peerTtlMs: 50,
    });

    discovery.recordPeerPresence('peer_remote1');
    assert.equal(discovery.getKnownPeers().length, 1);
    assert.equal(discovery.hasPeer('peer_remote1'), true);

    // After TTL expiry
    const now = Date.now() + 100;
    discovery.pruneStalePeers(now);
    assert.equal(discovery.getKnownPeers().length, 0);
  });
});
