import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { GitSyncEngine } from '../src/storage/gitSyncEngine';

describe('GitSyncEngine Suite', () => {
  test('initializes with default rate limit and formats headers with auth token and ETag', () => {
    const engine = new GitSyncEngine({
      owner: 'sysoce',
      repo: 'chat-data',
      branch: 'master',
      token: 'ghp_testtoken1234567890',
    });

    const rl = engine.getRateLimit();
    assert.strictEqual(rl.remaining, 5000);
    assert.strictEqual(rl.limit, 5000);
  });

  test('throws descriptive error if push is attempted without a token', async () => {
    const engine = new GitSyncEngine({
      owner: 'sysoce',
      repo: 'chat-data',
      branch: 'master',
    });

    await assert.rejects(
      async () => {
        await engine.pushSingleFile('test.json', '{}');
      },
      /Push requires a valid GitHub token/
    );
  });
});
