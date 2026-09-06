import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { TransportRegistry } from '../src/transport/transportRegistry.js';
import { ChatEventProjector } from '../src/engine/chatEventProjector.js';
import { DataIsolationGuard } from '../src/security/dataIsolationGuard.js';
import type { TransportAdapter, TransportMessage, TransportStatus } from '../src/transport/types.js';
import type { ChatMessage, ChatEvent } from '../src/types/chat.js';

class MockChannelTransport implements TransportAdapter {
  public status: TransportStatus = 'connected';
  public sentMessages: TransportMessage[] = [];
  private messageListeners = new Set<(msg: TransportMessage) => void>();
  private statusListeners = new Set<(status: TransportStatus) => void>();

  constructor(public readonly mode: string, public readonly priority: number, public readonly name: string) {}

  getStatus(): TransportStatus { return this.status; }
  async connect(): Promise<boolean> { this.status = 'connected'; return true; }
  disconnect(): void { this.status = 'disconnected'; }
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

describe('Channel Messaging Flow Suite', () => {
  it('transports public channel messages and projects them correctly', async () => {
    const registry = new TransportRegistry();
    const mockAdapter = new MockChannelTransport('live-sse', 3, 'Live SSE Bridge');
    registry.register(mockAdapter);

    const projector = new ChatEventProjector();
    projector.addChannel({ id: 'chan_general', name: 'general' });

    const channelId = 'chan_general';
    const author = { id: 'user_alice', name: 'Alice' };
    const text = 'Hello team! Autonomous agents are now live.';
    const msgId = 'msg_chan_001';
    const timestamp = Date.now();

    const rawMessage: ChatMessage = {
      id: msgId,
      channelId,
      author,
      content: text,
      timestamp,
      reactions: {},
    };

    const relativePath = `channels/${channelId}/messages/${timestamp}_${author.id}_${msgId}.json`;
    assert.ok(DataIsolationGuard.validateWritePath(relativePath, author.id));

    const transportMsg: TransportMessage = {
      id: `transport_${msgId}`,
      type: 'sync_file',
      channelId,
      path: relativePath,
      content: JSON.stringify(rawMessage),
      timestamp,
      senderId: author.id,
    };

    const sent = await registry.broadcast(transportMsg);
    assert.strictEqual(sent, true);
    assert.strictEqual(mockAdapter.sentMessages.length, 1);

    const received = JSON.parse(mockAdapter.sentMessages[0].content!);
    projector.ingestMessage(received);

    const state = projector.project();
    assert.ok(state.channels['chan_general']);
    assert.strictEqual(state.channels['chan_general'].messages.length, 1);
    assert.strictEqual(state.channels['chan_general'].messages[0].content, text);
    assert.strictEqual(state.channels['chan_general'].messages[0].author.name, 'Alice');
  });

  it('supports channel thread replies and emoji reactions', async () => {
    const projector = new ChatEventProjector();
    const channelId = 'chan_engineering';
    const rootMsgId = 'root_eng_01';
    const timestamp = 1700000000;

    projector.ingestMessage({
      id: rootMsgId,
      channelId,
      author: { id: 'user_alice', name: 'Alice' },
      content: 'Core refactoring complete.',
      timestamp,
      reactions: {},
    });

    projector.ingestMessage({
      id: 'reply_eng_01',
      channelId,
      threadRootId: rootMsgId,
      author: { id: 'user_bob', name: 'Bob' },
      content: 'Tests are passing cleanly.',
      timestamp: timestamp + 500,
      reactions: {},
    });

    const reactionEvent: ChatEvent = {
      id: 'ev_01',
      type: 'reaction_add',
      channelId,
      authorId: 'user_bob',
      targetMessageId: rootMsgId,
      emoji: '🚀',
      timestamp: timestamp + 600,
    };
    projector.ingestEvent(reactionEvent);

    const state = projector.project();
    const chanData = state.channels[channelId];
    assert.ok(chanData);
    assert.strictEqual(chanData.messages.length, 1);
    assert.strictEqual(chanData.messages[0].replyCount, 1);
    assert.deepStrictEqual(chanData.messages[0].reactions?.['🚀'], ['user_bob']);
    assert.strictEqual(chanData.threads[rootMsgId]?.length, 1);
  });
});
