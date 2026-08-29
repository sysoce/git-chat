import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { GitCommitQueue } from '../src/storage/gitCommitQueue.js';
import { OfflineQueue } from '../src/storage/offlineQueue.js';

describe('GitCommitQueue', () => {
  it('processes push tasks sequentially without concurrency races', async () => {
    const offlineQueue = new OfflineQueue();
    const executionOrder: string[] = [];

    const pusher = async (files: Array<{ relativePath: string; content: string }>) => {
      executionOrder.push(`start_${files[0].relativePath}`);
      await new Promise((r) => setTimeout(r, 10));
      executionOrder.push(`end_${files[0].relativePath}`);
      return 'commit_sha';
    };

    const queue = new GitCommitQueue({ pusher, offlineQueue });

    const p1 = queue.push([{ relativePath: 'file1.json', content: '1' }]);
    const p2 = queue.push([{ relativePath: 'file2.json', content: '2' }]);

    await Promise.all([p1, p2]);

    assert.deepEqual(executionOrder, [
      'start_file1.json',
      'end_file1.json',
      'start_file2.json',
      'end_file2.json',
    ]);
  });

  it('retries on retryable errors and succeeds', async () => {
    const offlineQueue = new OfflineQueue();
    let attempts = 0;

    const pusher = async () => {
      attempts++;
      if (attempts < 2) {
        throw new Error('409 Conflict: fast-forward update failed');
      }
      return 'sha_success';
    };

    const queue = new GitCommitQueue({ pusher, offlineQueue, maxRetries: 3, retryDelayMs: 5 });
    const result = await queue.push([{ relativePath: 'f.json', content: 'C' }]);

    assert.equal(result.success, true);
    assert.equal(result.commitSha, 'sha_success');
    assert.equal(attempts, 2);
  });

  it('buffers into offline queue when network fails completely', async () => {
    const offlineQueue = new OfflineQueue();
    const pusher = async () => {
      throw new Error('TypeError: Failed to fetch (Network offline)');
    };

    const queue = new GitCommitQueue({ pusher, offlineQueue, maxRetries: 1, retryDelayMs: 2 });
    const result = await queue.push([{ relativePath: 'offline_msg.json', content: 'msg' }]);

    assert.equal(result.success, false);
    assert.equal(result.queuedOffline, true);
    assert.equal(offlineQueue.size(), 1);
  });
});
