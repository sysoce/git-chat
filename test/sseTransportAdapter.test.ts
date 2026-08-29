import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { SseTransportAdapter } from '../src/transport/sseTransportAdapter';

describe('SseTransportAdapter Suite', () => {
  it('instantiates with live-sse mode and priority 3', () => {
    const adapter = new SseTransportAdapter({
      baseUrl: 'http://localhost:4300',
      userId: 'user_dev',
    });

    assert.strictEqual(adapter.mode, 'live-sse');
    assert.strictEqual(adapter.priority, 3);
    assert.strictEqual(adapter.name, 'Live SSE Bridge');
    assert.strictEqual(adapter.getStatus(), 'disconnected');
  });

  it('handles status transitions and listeners', () => {
    const adapter = new SseTransportAdapter({
      baseUrl: 'http://localhost:4300',
      userId: 'user_dev',
    });

    const statusLog: string[] = [];
    const unsub = adapter.onStatusChange((s) => statusLog.push(s));

    (adapter as any).setStatus('connecting');
    (adapter as any).setStatus('connected');
    (adapter as any).setStatus('disconnected');

    unsub();
    assert.deepStrictEqual(statusLog, ['connecting', 'connected', 'disconnected']);
  });
});
