import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { TransportRegistry } from '../src/transport/transportRegistry.js';
import { SseTransportAdapter } from '../src/transport/sseTransportAdapter.js';
import { GitTransportAdapter } from '../src/transport/gitTransportAdapter.js';
import { LiveReachabilityProbe } from '../src/transport/liveReachabilityProbe.js';
import { SyncStateMachine } from '../src/transport/syncStateMachine.js';
import type { TransportStatus, TransportMessage } from '../src/transport/types.js';

describe('Multi-Transport E2E & Auto-Fallback Suite', () => {
  it('prioritizes Live SSE over Git Sync backup when connected', () => {
    const registry = new TransportRegistry();
    const sse = new SseTransportAdapter({ baseUrl: 'http://localhost:4300', userId: 'user_dev' });
    const git = new GitTransportAdapter({ owner: 'sysoce', repo: 'chat-data', userId: 'user_dev' });

    registry.register(sse);
    registry.register(git);

    // Initial disconnected
    assert.strictEqual(registry.getBestAvailableTransport(), null);

    // Both connected -> Live SSE wins (priority 3 < priority 4)
    (sse as any).setStatus('connected');
    (git as any).setStatus('connected');

    const best = registry.getBestAvailableTransport();
    assert.ok(best);
    assert.strictEqual(best?.mode, 'live-sse');
  });

  it('falls back seamlessly to Git Sync backup when Live SSE fails or disconnects', () => {
    const registry = new TransportRegistry();
    const sse = new SseTransportAdapter({ baseUrl: 'http://localhost:4300', userId: 'user_dev' });
    const git = new GitTransportAdapter({ owner: 'sysoce', repo: 'chat-data', userId: 'user_dev' });

    registry.register(sse);
    registry.register(git);

    (sse as any).setStatus('connected');
    (git as any).setStatus('connected');
    assert.strictEqual(registry.getBestAvailableTransport()?.mode, 'live-sse');

    // SSE connection drops
    (sse as any).setStatus('disconnected');
    assert.strictEqual(registry.getBestAvailableTransport()?.mode, 'git-sync');

    // SSE reconnects -> restored as active
    (sse as any).setStatus('connected');
    assert.strictEqual(registry.getBestAvailableTransport()?.mode, 'live-sse');
  });

  it('coordinates state transitions via SyncStateMachine and triggers reachability auto-recovery', async () => {
    let activeMode = 'live-sse';
    let reachabilityTriggered = false;

    const machine = new SyncStateMachine({
      initialMode: 'live-sse',
      onModeChange: (m) => { activeMode = m; },
      onLiveServerReachable: () => { reachabilityTriggered = true; },
    });

    assert.strictEqual(machine.getMode(), 'live-sse');

    // Server drops -> fallback to git-backup
    machine.handlePrimarySseFailure();
    assert.strictEqual(machine.getMode(), 'git-sync');
    assert.strictEqual(activeMode, 'git-sync');

    // Reachability probe detects server is back online -> restores live SSE
    machine.triggerLiveServerReachable();
    assert.strictEqual(reachabilityTriggered, true);
    machine.restorePrimaryLive();
    assert.strictEqual(machine.getMode(), 'live-sse');
    assert.strictEqual(activeMode, 'live-sse');

    machine.stop();
  });
});
