import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  createOfferSignal,
  createAnswerSignal,
  createCandidateSignal,
  createByeSignal
} from '../src/p2p/p2pSignaler';

describe('P2P Signaler Helpers Suite', () => {
  it('creates valid offer signal message', () => {
    const sdp = { type: 'offer', sdp: 'v=0...' };
    const sig = createOfferSignal('peerA', 'peerB', sdp);
    assert.strictEqual(sig.type, 'offer');
    assert.strictEqual(sig.senderId, 'peerA');
    assert.strictEqual(sig.recipientId, 'peerB');
    assert.deepStrictEqual(sig.sdp, sdp);
    assert.ok(sig.timestamp > 0);
  });

  it('creates valid answer signal message', () => {
    const sdp = { type: 'answer', sdp: 'v=0...' };
    const sig = createAnswerSignal('peerB', 'peerA', sdp);
    assert.strictEqual(sig.type, 'answer');
    assert.strictEqual(sig.senderId, 'peerB');
    assert.strictEqual(sig.recipientId, 'peerA');
    assert.deepStrictEqual(sig.sdp, sdp);
  });

  it('creates valid candidate signal message', () => {
    const candidate = { candidate: 'candidate:1 1 UDP...', sdpMid: '0', sdpMLineIndex: 0 };
    const sig = createCandidateSignal('peerA', 'peerB', candidate);
    assert.strictEqual(sig.type, 'candidate');
    assert.strictEqual(sig.senderId, 'peerA');
    assert.deepStrictEqual(sig.candidate, candidate);
  });

  it('creates valid bye signal message', () => {
    const sig = createByeSignal('peerA', 'peerB');
    assert.strictEqual(sig.type, 'bye');
    assert.strictEqual(sig.senderId, 'peerA');
    assert.strictEqual(sig.recipientId, 'peerB');
  });
});
