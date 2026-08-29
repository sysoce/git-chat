import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { LiveMeshTransportAdapter } from '../src/transport/liveMeshTransportAdapter';

describe('LiveMeshTransportAdapter Suite', () => {
  it('instantiates with live-mesh mode and priority 2', () => {
    const adapter = new LiveMeshTransportAdapter({
      owner: 'sysoce',
      repo: 'chat-data',
      userId: 'user_dev',
    });

    assert.strictEqual(adapter.mode, 'live-mesh');
    assert.strictEqual(adapter.priority, 2);
    assert.strictEqual(adapter.name, 'Live Mesh Relay');
    assert.strictEqual(adapter.getStatus(), 'disconnected');
  });

  it('reports status changes properly', () => {
    const adapter = new LiveMeshTransportAdapter({
      owner: 'sysoce',
      repo: 'chat-data',
      userId: 'user_dev',
    });

    const statusList: string[] = [];
    const unsub = adapter.onStatusChange((s) => statusList.push(s));

    // Force internal status update
    (adapter as any).setStatus('connecting');
    (adapter as any).setStatus('connected');
    (adapter as any).setStatus('disconnected');

    unsub();
    assert.deepStrictEqual(statusList, ['connecting', 'connected', 'disconnected']);
  });

  it('dispatches incoming messages to registered listeners', () => {
    const adapter = new LiveMeshTransportAdapter({
      owner: 'sysoce',
      repo: 'chat-data',
      userId: 'user_dev',
    });

    const received: any[] = [];
    adapter.onMessage((msg) => received.push(msg));

    (adapter as any).handleRelayFile('channels/chan_general/messages/123.json', '{"content":"hello"}');
    assert.strictEqual(received.length, 1);
    assert.strictEqual(received[0].type, 'sync_file');
    assert.strictEqual(received[0].path, 'channels/chan_general/messages/123.json');
    assert.strictEqual(received[0].content, '{"content":"hello"}');
  });
});
