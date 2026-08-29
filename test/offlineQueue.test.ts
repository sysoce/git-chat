import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { OfflineQueue } from '../src/storage/offlineQueue.js';

describe('OfflineQueue', () => {
  it('enqueues items and reports queue size', () => {
    const queue = new OfflineQueue();
    assert.equal(queue.size(), 0);

    queue.enqueue([{ relativePath: 'channels/gen/messages/1.json', content: '{"id":1}' }]);
    assert.equal(queue.size(), 1);

    queue.enqueue([{ relativePath: 'channels/gen/messages/2.json', content: '{"id":2}' }]);
    assert.equal(queue.size(), 2);
  });

  it('peeks and dequeues items in FIFO order', () => {
    const queue = new OfflineQueue();
    queue.enqueue([{ relativePath: 'a.json', content: 'A' }]);
    queue.enqueue([{ relativePath: 'b.json', content: 'B' }]);

    const peeked = queue.peek();
    assert.equal(peeked?.files[0]?.relativePath, 'a.json');

    const item1 = queue.dequeue();
    assert.equal(item1?.files[0]?.relativePath, 'a.json');
    assert.equal(queue.size(), 1);

    const item2 = queue.dequeue();
    assert.equal(item2?.files[0]?.relativePath, 'b.json');
    assert.equal(queue.size(), 0);
  });

  it('handles drain with processor callback', async () => {
    const queue = new OfflineQueue();
    queue.enqueue([{ relativePath: '1.json', content: '1' }]);
    queue.enqueue([{ relativePath: '2.json', content: '2' }]);

    const processed: string[] = [];
    const successCount = await queue.drain(async (files) => {
      processed.push(files[0].relativePath);
      return true;
    });

    assert.equal(successCount, 2);
    assert.deepEqual(processed, ['1.json', '2.json']);
    assert.equal(queue.size(), 0);
  });

  it('stops draining on processor failure and retains remaining items', async () => {
    const queue = new OfflineQueue();
    queue.enqueue([{ relativePath: '1.json', content: '1' }]);
    queue.enqueue([{ relativePath: '2.json', content: '2' }]);

    let callCount = 0;
    const successCount = await queue.drain(async (files) => {
      callCount++;
      if (files[0].relativePath === '2.json') return false;
      return true;
    });

    assert.equal(successCount, 1);
    assert.equal(callCount, 2);
    assert.equal(queue.size(), 1);
    assert.equal(queue.peek()?.files[0]?.relativePath, '2.json');
  });
});
