import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  GistClient,
  mergeGistSyncFiles,
  GIST_MAX_FILES,
  GIST_SYNC_FILENAME,
  type GistSyncFile,
} from '../src/storage/gistClient';

const realFetch = globalThis.fetch;

interface RecordedCall {
  url: string;
  method: string;
  body?: string;
}

function stubFetch(handler: (call: RecordedCall) => Response): RecordedCall[] {
  const calls: RecordedCall[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const call: RecordedCall = {
      url: String(input),
      method: init?.method || 'GET',
      body: init?.body,
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return calls;
}

function gistResponse(files: GistSyncFile[]): Response {
  const payload = { version: '1.0.8', updatedAt: Date.now(), files };
  return new Response(
    JSON.stringify({ files: { [GIST_SYNC_FILENAME]: { content: JSON.stringify(payload) } } }),
    { status: 200, headers: { 'x-ratelimit-remaining': '4000', ETag: 'W/"abc"' } },
  );
}

describe('Gist Vault Rolling Backup Suite', () => {
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('merges incoming files by path without duplicating entries', () => {
    const existing: GistSyncFile[] = [
      { path: 'users/user_alice.json', content: '{"id":"user_alice"}', updatedAt: 1 },
      { path: 'channels/chan_general/messages/m1.json', content: '{"id":"m1"}', updatedAt: 2 },
    ];
    const merged = mergeGistSyncFiles(existing, [
      { path: 'channels/chan_general/messages/m1.json', content: '{"id":"m1","edited":true}' },
      { path: 'channels/chan_general/messages/m2.json', content: '{"id":"m2"}' },
    ]);

    assert.strictEqual(merged.length, 3, 'existing paths must be replaced, not appended');
    const m1 = merged.find((f) => f.path.endsWith('m1.json'));
    assert.ok(m1!.content.includes('edited'), 'newer content must win for the same path');
  });

  it('prunes the oldest message entries once the vault exceeds its file budget', () => {
    const existing: GistSyncFile[] = [];
    for (let i = 0; i < GIST_MAX_FILES + 40; i++) {
      existing.push({
        path: `channels/chan_general/messages/m${i}.json`,
        content: `{"id":"m${i}"}`,
        updatedAt: i + 1,
      });
    }

    const merged = mergeGistSyncFiles(existing, [
      { path: 'channels/chan_general/messages/newest.json', content: '{"id":"newest"}' },
    ]);

    assert.ok(merged.length <= GIST_MAX_FILES, `vault must stay bounded, got ${merged.length}`);
    assert.ok(
      merged.some((f) => f.path.endsWith('newest.json')),
      'the newest message must survive pruning',
    );
    assert.ok(
      !merged.some((f) => f.path.endsWith('/m0.json')),
      'the oldest message must be pruned first',
    );
  });

  it('never prunes identity, channel metadata, or workspace config', () => {
    const existing: GistSyncFile[] = [
      { path: 'users/user_alice.json', content: '{"id":"user_alice"}', updatedAt: 1 },
      { path: 'channels/chan_general/meta.json', content: '{"id":"chan_general"}', updatedAt: 1 },
      { path: 'config/members.json', content: '{"members":[]}', updatedAt: 1 },
    ];
    for (let i = 0; i < GIST_MAX_FILES + 100; i++) {
      existing.push({
        path: `channels/chan_general/messages/m${i}.json`,
        content: `{"id":"m${i}"}`,
        updatedAt: i + 10,
      });
    }

    const merged = mergeGistSyncFiles(existing, []);
    const survivingPaths = merged.map((f) => f.path);

    assert.ok(survivingPaths.includes('users/user_alice.json'), 'identity must be retained');
    assert.ok(survivingPaths.includes('channels/chan_general/meta.json'), 'channel meta must be retained');
    assert.ok(survivingPaths.includes('config/members.json'), 'workspace config must be retained');
  });

  it('writes a batch of files in a single Gist revision', async () => {
    const calls = stubFetch((call) =>
      call.method === 'PATCH'
        ? new Response('{}', { status: 200, headers: { 'x-ratelimit-remaining': '3999' } })
        : gistResponse([]),
    );

    const client = new GistClient({ token: 'tok_test', gistId: 'gist_test' });
    await client.pushSyncFiles([
      { path: 'channels/chan_general/messages/m1.json', content: '{"id":"m1"}' },
      { path: 'channels/chan_general/messages/m2.json', content: '{"id":"m2"}' },
      { path: 'presence/user_alice.json', content: '{"userId":"user_alice"}' },
    ]);

    const writes = calls.filter((c) => c.method === 'PATCH');
    assert.strictEqual(writes.length, 1, 'a batch must cost exactly one write against the quota');

    const body = JSON.parse(writes[0].body!);
    const payload = JSON.parse(body.files[GIST_SYNC_FILENAME].content);
    assert.strictEqual(payload.files.length, 3, 'all batched files must land in one revision');
  });

  it('surfaces Gist write failures instead of silently dropping messages', async () => {
    stubFetch((call) =>
      call.method === 'PATCH'
        ? new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })
        : gistResponse([]),
    );

    const client = new GistClient({ token: 'bad_token', gistId: 'gist_test' });
    await assert.rejects(
      () => client.pushSyncFiles([{ path: 'users/user_alice.json', content: '{}' }]),
      /Gist update error \(401\)/,
    );
  });

  it('treats an empty batch as a no-op without touching the network', async () => {
    const calls = stubFetch(() => gistResponse([]));
    const client = new GistClient({ token: 'tok_test', gistId: 'gist_test' });
    await client.pushSyncFiles([]);
    assert.strictEqual(calls.length, 0, 'an empty batch must not spend any quota');
  });

  it('records rate limit exhaustion from response headers', async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 60;
    stubFetch(() =>
      new Response(JSON.stringify({ message: 'API rate limit exceeded' }), {
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(resetAt) },
      }),
    );

    const client = new GistClient({ token: 'tok_test', gistId: 'gist_test' });
    await assert.rejects(() => client.fetchSyncState());

    const rate = client.getRateLimitInfo();
    assert.strictEqual(rate.isRateLimited, true, 'client must know it is rate limited');
    assert.strictEqual(rate.remaining, 0);
    assert.ok(rate.rateLimitReset >= resetAt * 1000, 'reset window must come from the reset header');
  });
});
