import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { P2PNegotiator } from '../src/p2p/p2pNegotiator.js';

describe('P2PNegotiator', () => {
  it('determines polite peer deterministically from peer IDs', () => {
    const peerA = new P2PNegotiator({ localPeerId: 'peer_aaa', remotePeerId: 'peer_bbb' });
    const peerB = new P2PNegotiator({ localPeerId: 'peer_bbb', remotePeerId: 'peer_aaa' });

    assert.equal(peerA.isPolite(), true);
    assert.equal(peerB.isPolite(), false);
  });

  it('determines whether to ignore offer on collision (glare)', () => {
    // Impolite peer should ignore collision offer when signaling is not stable
    const impolite = new P2PNegotiator({ localPeerId: 'peer_z', remotePeerId: 'peer_a' });
    impolite.setMakingOffer(true);
    assert.equal(impolite.shouldIgnoreOffer('have-local-offer'), true);

    // Polite peer should NOT ignore collision offer and instead accept it (triggering rollback)
    const polite = new P2PNegotiator({ localPeerId: 'peer_a', remotePeerId: 'peer_z' });
    polite.setMakingOffer(true);
    assert.equal(polite.shouldIgnoreOffer('have-local-offer'), false);
    assert.equal(polite.shouldRollback('have-local-offer'), true);
  });

  it('buffers ICE candidates and flushes when ready', () => {
    const negotiator = new P2PNegotiator({ localPeerId: 'peer_1', remotePeerId: 'peer_2' });
    const candidate1 = { candidate: 'cand1', sdpMid: '0', sdpMLineIndex: 0 };
    const candidate2 = { candidate: 'cand2', sdpMid: '0', sdpMLineIndex: 0 };

    negotiator.bufferCandidate(candidate1);
    negotiator.bufferCandidate(candidate2);
    assert.equal(negotiator.getPendingCandidates().length, 2);

    const flushed = negotiator.flushPendingCandidates();
    assert.equal(flushed.length, 2);
    assert.equal(negotiator.getPendingCandidates().length, 0);
  });
});
