import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { GistTransportAdapter } from '../src/transport/gistTransportAdapter.js';
import { computeClientPollInterval } from '../src/transport/syncPollingPolicy.js';
import { createRateLimitState, updateRateLimitFromResponse } from '../src/transport/gistHttp.js';

describe('GistTransportAdapter & Polling Policy Suite', () => {
  it('instantiates with gist-sync mode and priority 4', () => {
    const adapter = new GistTransportAdapter({
      config: {
        token: 'ghp_test123',
        gistId: 'gist_abc456',
      },
    });

    assert.strictEqual(adapter.mode, 'gist-sync');
    assert.strictEqual(adapter.priority, 4);
    assert.strictEqual(adapter.name, 'GitHub Gist Sync');
    assert.strictEqual(adapter.getStatus(), 'disconnected');
  });

  it('handles status transitions and listeners cleanly', () => {
    const adapter = new GistTransportAdapter({
      config: { token: 'ghp_test', gistId: 'gist_123' },
    });

    const statusLog: string[] = [];
    const unsub = adapter.onStatusChange((s) => statusLog.push(s));

    (adapter as any).setStatus('connecting');
    (adapter as any).setStatus('connected');
    (adapter as any).setStatus('disconnected');

    unsub();
    assert.deepStrictEqual(statusLog, ['connecting', 'connected', 'disconnected']);
  });

  it('computes adaptive client polling interval based on activity and quota', () => {
    // Awaiting response in foreground -> fast poll (6s)
    const activePoll = computeClientPollInterval({
      isAwaitingResponse: true,
      awaitingStartedAt: Date.now() - 5000,
      isHidden: false,
      remainingQuota: 4500,
    });
    assert.strictEqual(activePoll, 6000);

    // Background / hidden tab -> throttled poll (45s)
    const hiddenPoll = computeClientPollInterval({
      isHidden: true,
      remainingQuota: 4500,
    });
    assert.strictEqual(hiddenPoll, 45000);

    // Low rate-limit quota -> throttled poll (45s)
    const lowQuotaPoll = computeClientPollInterval({
      remainingQuota: 20,
    });
    assert.strictEqual(lowQuotaPoll, 45000);

    // Idle foreground -> normal interval (15s)
    const idlePoll = computeClientPollInterval({
      isHidden: false,
      remainingQuota: 4000,
    });
    assert.strictEqual(idlePoll, 15000);
  });

  it('tracks rate limits from HTTP response headers', () => {
    const state = createRateLimitState();
    const mockRes = {
      status: 200,
      ok: true,
      headers: {
        get: (key: string) => {
          if (key === 'x-ratelimit-remaining') return '3500';
          if (key === 'x-ratelimit-limit') return '5000';
          if (key === 'x-ratelimit-reset') return '1700000000';
          return null;
        },
      },
    } as any;

    updateRateLimitFromResponse(state, mockRes);
    assert.strictEqual(state.remaining, 3500);
    assert.strictEqual(state.limit, 5000);
    assert.strictEqual(state.isRateLimited, false);
  });

  it('dispatches incoming discrete sync files to message listeners', async () => {
    const mockGistClient = {
      fetchSyncState: async () => ({
        data: {
          files: [
            { path: 'channels/chan_general/messages/1_user_msg.json', content: '{"id":"msg1","content":"hello"}' },
          ],
        },
        etag: 'etag_123',
        notModified: false,
      }),
      pushSyncFile: async () => {},
      getRateLimitInfo: () => ({ remaining: 4900, limit: 5000, resetTime: 0, isBlocked: false }),
    } as any;

    const adapter = new GistTransportAdapter({
      config: { token: 'ghp_test', gistId: 'gist_123' },
      gistClient: mockGistClient,
    });

    const receivedMessages: any[] = [];
    adapter.onMessage((msg) => receivedMessages.push(msg));

    const ok = await adapter.connect();
    assert.strictEqual(ok, true);
    assert.strictEqual(adapter.getStatus(), 'connected');
    assert.strictEqual(receivedMessages.length, 1);
    assert.strictEqual(receivedMessages[0].path, 'channels/chan_general/messages/1_user_msg.json');

    adapter.disconnect();
    assert.strictEqual(adapter.getStatus(), 'disconnected');
  });
});
