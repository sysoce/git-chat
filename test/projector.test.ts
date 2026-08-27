import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { ChatEventProjector } from '../src/engine/chatEventProjector';
import { ChatManifestGenerator } from '../src/engine/chatManifestGenerator';
import type { ChatMessage, ChatEvent } from '../src/types/chat';

describe('ChatEventProjector & Manifest Generator Suite', () => {
  it('correctly aggregates messages, thread replies, and reactions', () => {
    const projector = new ChatEventProjector();

    projector.addChannel({ id: 'chan_general', name: 'general' });

    const rootMsg: ChatMessage = {
      id: 'root-001',
      channelId: 'chan_general',
      author: { id: 'user_alice', name: 'Alice' },
      content: 'Hello team!',
      timestamp: 1000,
    };

    const threadReply: ChatMessage = {
      id: 'reply-001',
      channelId: 'chan_general',
      threadRootId: 'root-001',
      author: { id: 'user_bob', name: 'Bob' },
      content: 'Hey Alice, checking in!',
      timestamp: 2000,
    };

    const reactEvent: ChatEvent = {
      id: 'ev-001',
      type: 'reaction_add',
      channelId: 'chan_general',
      authorId: 'user_bob',
      targetMessageId: 'root-001',
      emoji: '🚀',
      timestamp: 1500,
    };

    projector.ingestMessage(rootMsg);
    projector.ingestMessage(threadReply);
    projector.ingestEvent(reactEvent);

    const state = projector.project();
    const chanData = state.channels['chan_general'];

    assert.ok(chanData);
    assert.equal(chanData.messages.length, 1);
    assert.equal(chanData.messages[0]!.id, 'root-001');
    assert.equal(chanData.messages[0]!.replyCount, 1);
    assert.deepEqual(chanData.messages[0]!.reactions, { '🚀': ['user_bob'] });

    assert.ok(chanData.threads['root-001']);
    assert.equal(chanData.threads['root-001']!.length, 1);
    assert.equal(chanData.threads['root-001']![0]!.id, 'reply-001');

    // Generate manifest
    const manifest = ChatManifestGenerator.generateManifest('Test Workspace', state);
    assert.equal(manifest.channels['chan_general']!.messageCount, 1);
    assert.equal(manifest.totalMessagesCount, 1);
  });

  it('handles reaction removal correctly', () => {
    const projector = new ChatEventProjector();
    projector.addChannel({ id: 'chan_general', name: 'general' });

    projector.ingestMessage({
      id: 'm1',
      channelId: 'chan_general',
      author: { id: 'alice', name: 'Alice' },
      content: 'Test',
      timestamp: 1000,
    });

    projector.ingestEvent({
      id: 'ev1',
      type: 'reaction_add',
      channelId: 'chan_general',
      authorId: 'bob',
      targetMessageId: 'm1',
      emoji: '👍',
      timestamp: 1100,
    });

    projector.ingestEvent({
      id: 'ev2',
      type: 'reaction_remove',
      channelId: 'chan_general',
      authorId: 'bob',
      targetMessageId: 'm1',
      emoji: '👍',
      timestamp: 1200,
    });

    const state = projector.project();
    assert.deepEqual(state.channels['chan_general']!.messages[0]!.reactions, {});
  });
});
