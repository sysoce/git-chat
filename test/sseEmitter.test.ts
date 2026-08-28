import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { EventEmitter } from 'node:events';
import { SseEmitter } from '../src/server/sseEmitter';

class MockResponse extends EventEmitter {
  public written: string[] = [];
  public socket = { setTimeout: () => {}, setNoDelay: () => {}, setKeepAlive: () => {} };
  public statusCode = 0;
  public headers: Record<string, string> = {};

  writeHead(status: number, headers: Record<string, string>) {
    this.statusCode = status;
    this.headers = headers;
  }

  write(chunk: string) {
    this.written.push(chunk);
    return true;
  }

  end() {
    this.emit('close');
  }
}

describe('SseEmitter Suite', () => {
  test('registers client, sends headers, and broadcasts events cleanly', () => {
    const emitter = new SseEmitter();
    const mockRes = new MockResponse() as any;

    emitter.addClient(mockRes);
    assert.strictEqual(emitter.getClientCount(), 1);
    assert.strictEqual(mockRes.statusCode, 200);
    assert.strictEqual(mockRes.headers['Content-Type'], 'text/event-stream');

    emitter.broadcastFiles([{ relativePath: 'messages/m1.json', content: '{"hello":1}' }]);
    const broadcasted = mockRes.written.find((w: string) => w.includes('sync_files'));
    assert.ok(broadcasted, 'Expected sync_files event to be written');
    assert.ok(broadcasted.includes('messages/m1.json'));

    mockRes.end();
    assert.strictEqual(emitter.getClientCount(), 0);
    emitter.close();
  });
});
