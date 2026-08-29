import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { P2PHeartbeat } from '../src/p2p/p2pHeartbeat';

describe('P2P Heartbeat Suite', () => {
  it('sends periodic ping messages', (t, done) => {
    let pingsSent = 0;
    const hb = new P2PHeartbeat({
      intervalMs: 50,
      timeoutMs: 150,
      sendPing: () => {
        pingsSent++;
        if (pingsSent >= 2) {
          hb.stop();
          assert.ok(pingsSent >= 2);
          done();
        }
      },
      onTimeout: () => {}
    });
    hb.start();
  });

  it('triggers onTimeout when pong is not received within timeout interval', (t, done) => {
    const hb = new P2PHeartbeat({
      intervalMs: 30,
      timeoutMs: 80,
      sendPing: () => {},
      onTimeout: () => {
        hb.stop();
        assert.ok(true);
        done();
      }
    });
    hb.start();
  });

  it('resets timeout when pong is received', (t, done) => {
    let timeoutTriggered = false;
    const hb = new P2PHeartbeat({
      intervalMs: 30,
      timeoutMs: 70,
      sendPing: () => {},
      onTimeout: () => {
        timeoutTriggered = true;
      }
    });
    hb.start();

    // Send pong at 40ms to prevent timeout
    setTimeout(() => {
      hb.handlePong();
    }, 40);

    setTimeout(() => {
      hb.stop();
      assert.strictEqual(timeoutTriggered, false);
      done();
    }, 80);
  });
});
