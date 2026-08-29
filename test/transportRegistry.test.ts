import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { TransportRegistry } from '../src/transport/transportRegistry';
import type { TransportAdapter, TransportStatus, TransportMessage } from '../src/transport/types';

class MockTransport implements TransportAdapter {
  private status: TransportStatus = 'disconnected';
  private statusListeners = new Set<(s: TransportStatus) => void>();
  private messageListeners = new Set<(m: TransportMessage) => void>();
  public sentMessages: TransportMessage[] = [];

  constructor(
    public readonly mode: string,
    public readonly priority: number,
    public readonly name: string
  ) {}

  getStatus(): TransportStatus {
    return this.status;
  }

  setStatus(s: TransportStatus): void {
    this.status = s;
    for (const l of this.statusListeners) l(s);
  }

  async connect(): Promise<boolean> {
    this.setStatus('connected');
    return true;
  }

  disconnect(): void {
    this.setStatus('disconnected');
  }

  async send(message: TransportMessage): Promise<boolean> {
    this.sentMessages.push(message);
    return true;
  }

  onMessage(listener: (msg: TransportMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatusChange(listener: (status: TransportStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }
}

describe('TransportRegistry & Multi-Transport Resolution Suite', () => {
  it('registers and unregisters transport adapters cleanly', () => {
    const registry = new TransportRegistry();
    const p2p = new MockTransport('p2p', 1, 'WebRTC P2P');
    const mesh = new MockTransport('live-mesh', 2, 'Live Mesh');

    registry.register(p2p);
    registry.register(mesh);

    assert.strictEqual(registry.getTransport('p2p'), p2p);
    assert.strictEqual(registry.getTransport('live-mesh'), mesh);
    assert.strictEqual(registry.getAllTransports().length, 2);

    registry.unregister('p2p');
    assert.strictEqual(registry.getTransport('p2p'), undefined);
    assert.strictEqual(registry.getAllTransports().length, 1);
  });

  it('selects the best available connected transport based on priority', async () => {
    const registry = new TransportRegistry();
    const p2p = new MockTransport('p2p', 1, 'WebRTC P2P');
    const mesh = new MockTransport('live-mesh', 2, 'Live Mesh');
    const sse = new MockTransport('live-sse', 3, 'Live SSE');
    const git = new MockTransport('git-sync', 4, 'GitHub Sync');

    registry.register(sse);
    registry.register(p2p);
    registry.register(git);
    registry.register(mesh);

    assert.strictEqual(registry.getBestAvailableTransport(), null);

    await mesh.connect();
    assert.strictEqual(registry.getBestAvailableTransport()?.mode, 'live-mesh');

    await sse.connect();
    // Mesh has higher priority (2 < 3)
    assert.strictEqual(registry.getBestAvailableTransport()?.mode, 'live-mesh');

    await p2p.connect();
    // P2P has highest priority (1 < 2)
    assert.strictEqual(registry.getBestAvailableTransport()?.mode, 'p2p');

    p2p.disconnect();
    // Falls back to mesh
    assert.strictEqual(registry.getBestAvailableTransport()?.mode, 'live-mesh');
  });

  it('emits onActiveTransportChange when active transport changes', async () => {
    const registry = new TransportRegistry();
    const p2p = new MockTransport('p2p', 1, 'WebRTC P2P');
    const mesh = new MockTransport('live-mesh', 2, 'Live Mesh');

    const activeHistory: string[] = [];
    const unsub = registry.onActiveTransportChange((active) => {
      activeHistory.push(active ? active.mode : 'none');
    });

    registry.register(p2p);
    registry.register(mesh);

    await mesh.connect();
    await p2p.connect();
    p2p.disconnect();
    mesh.disconnect();

    unsub();
    assert.ok(activeHistory.includes('live-mesh'));
    assert.ok(activeHistory.includes('p2p'));
    assert.strictEqual(activeHistory[activeHistory.length - 1], 'none');
  });
});
