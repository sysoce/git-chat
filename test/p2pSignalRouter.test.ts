import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { P2PSignalStore, handleP2PSignalRoute } from '../src/server/p2pSignalRouter';
import { Readable } from 'node:stream';

describe('P2PSignalStore & Router Suite', () => {
  it('stores and retrieves signals for specific recipients', () => {
    const store = new P2PSignalStore();
    store.push({ type: 'offer', senderId: 'peerA', recipientId: 'peerB', timestamp: Date.now() });
    store.push({ type: 'candidate', senderId: 'peerA', recipientId: 'peerC', timestamp: Date.now() });

    const forB = store.getSignals('peerB');
    assert.strictEqual(forB.length, 1);
    assert.strictEqual(forB[0].type, 'offer');

    // Retrieved signals are drained
    const forBAgain = store.getSignals('peerB');
    assert.strictEqual(forBAgain.length, 0);

    const forC = store.getSignals('peerC');
    assert.strictEqual(forC.length, 1);
  });

  it('prunes expired signals older than ttlMs', () => {
    const store = new P2PSignalStore();
    store.push({ type: 'offer', senderId: 'peerA', recipientId: 'peerB', timestamp: Date.now() - 70000 });
    store.push({ type: 'candidate', senderId: 'peerA', recipientId: 'peerB', timestamp: Date.now() });

    store.pruneExpired(60000);
    const remaining = store.getSignals('peerB');
    assert.strictEqual(remaining.length, 1);
    assert.strictEqual(remaining[0].type, 'candidate');
  });

  it('handles GET and POST /api/p2p/signal HTTP requests', async () => {
    const store = new P2PSignalStore();

    // Mock POST request using stream Readable
    const postBody = JSON.stringify({ type: 'offer', senderId: 'peerA', recipientId: 'peerB' });
    const postReq: any = Readable.from([Buffer.from(postBody)]);
    postReq.method = 'POST';
    const postRes: any = {
      writeHead: (code: number, headers: any) => { postRes.statusCode = code; },
      setHeader: () => {},
      end: (body: string) => { postRes.body = body; }
    };

    const postHandled = await handleP2PSignalRoute(postReq, postRes, '/api/p2p/signal', new URL('http://localhost/api/p2p/signal'), store);
    assert.strictEqual(postHandled, true);
    assert.strictEqual(postRes.statusCode, 200);

    // Mock GET request
    const getReq: any = { method: 'GET' };
    const getRes: any = {
      writeHead: (code: number, headers: any) => { getRes.statusCode = code; },
      setHeader: () => {},
      end: (body: string) => { getRes.body = body; }
    };

    const getHandled = await handleP2PSignalRoute(getReq, getRes, '/api/p2p/signal', new URL('http://localhost/api/p2p/signal?recipientId=peerB'), store);
    assert.strictEqual(getHandled, true);
    assert.strictEqual(getRes.statusCode, 200);
    const parsed = JSON.parse(getRes.body);
    assert.strictEqual(parsed.ok, true);
    assert.strictEqual(parsed.signals.length, 1);
    assert.strictEqual(parsed.signals[0].type, 'offer');
  });
});
