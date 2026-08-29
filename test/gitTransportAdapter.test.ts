import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { GitTransportAdapter } from '../src/transport/gitTransportAdapter';

describe('GitTransportAdapter Suite', () => {
  it('instantiates with git-sync mode and priority 4', () => {
    const adapter = new GitTransportAdapter({
      owner: 'sysoce',
      repo: 'chat-data',
      branch: 'master',
      userId: 'user_dev',
    });

    assert.strictEqual(adapter.mode, 'git-sync');
    assert.strictEqual(adapter.priority, 4);
    assert.strictEqual(adapter.name, 'GitHub Git Sync');
    assert.strictEqual(adapter.getStatus(), 'disconnected');
  });

  it('reports status transitions and listeners', () => {
    const adapter = new GitTransportAdapter({
      owner: 'sysoce',
      repo: 'chat-data',
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
