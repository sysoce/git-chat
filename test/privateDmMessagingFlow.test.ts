import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { TransportRegistry } from '../src/transport/transportRegistry.js';
import { ChatEventProjector } from '../src/engine/chatEventProjector.js';
import { getDmChannelId, parseDmChannelUsers } from '../src/types/dm.js';
import { deriveDMKey, encryptContent, decryptContent } from '../src/security/cryptoVault.js';
import { DataIsolationGuard } from '../src/security/dataIsolationGuard.js';
import type { TransportAdapter, TransportMessage, TransportStatus } from '../src/transport/types.js';
import type { ChatMessage } from '../src/types/chat.js';

class MockDmTransport implements TransportAdapter {
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

describe('Private DM Messaging Flow Suite', () => {
  it('transports encrypted 1-on-1 private Direct Messages (DMs) with end-to-end decryption', async () => {
    const registry = new TransportRegistry();
    const mockAdapter = new MockDmTransport('live-sse', 3, 'Live SSE Bridge');
    registry.register(mockAdapter);

    const bobProjector = new ChatEventProjector();
    const workspaceSecret = 'test-team-secret-2026';
    const userAlice = { id: 'user_alice', name: 'Alice' };
    const userBob = { id: 'user_bob', name: 'Bob' };

    const dmChannelId = getDmChannelId(userAlice.id, userBob.id);
    assert.strictEqual(dmChannelId, 'chan_dm_user_alice__user_bob');
    assert.deepStrictEqual(parseDmChannelUsers(dmChannelId), ['user_alice', 'user_bob']);

    const aliceDmKey = await deriveDMKey(workspaceSecret, userAlice.id, userBob.id);
    const bobDmKey = await deriveDMKey(workspaceSecret, userBob.id, userAlice.id);

    const secretText = 'Hey Bob, here are the confidential server credentials.';
    const encrypted = await encryptContent(secretText, aliceDmKey);

    const msgId = 'dm_msg_001';
    const timestamp = Date.now();
    const diskMessage: ChatMessage = {
      id: msgId,
      channelId: dmChannelId,
      author: userAlice,
      content: '[Encrypted Message]',
      encrypted,
      timestamp,
    };

    const relativePath = `channels/${dmChannelId}/messages/${timestamp}_${userAlice.id}_${msgId}.json`;
    assert.ok(DataIsolationGuard.validateWritePath(relativePath, userAlice.id));

    const transportMsg: TransportMessage = {
      id: `transport_${msgId}`,
      type: 'sync_file',
      channelId: dmChannelId,
      recipientId: userBob.id,
      path: relativePath,
      content: JSON.stringify(diskMessage),
      timestamp,
      senderId: userAlice.id,
    };

    await registry.sendPrivateMessage(userBob.id, transportMsg);
    assert.strictEqual(mockAdapter.sentMessages.length, 1);

    const bobReceivedDiskMsg = JSON.parse(mockAdapter.sentMessages[0].content!) as ChatMessage;
    assert.ok(bobReceivedDiskMsg.encrypted);

    const decryptedText = await decryptContent(bobReceivedDiskMsg.encrypted, bobDmKey);
    assert.strictEqual(decryptedText, secretText);

    bobProjector.ingestMessage({
      ...bobReceivedDiskMsg,
      content: decryptedText,
    });

    const bobState = bobProjector.project();
    assert.ok(bobState.channels[dmChannelId]);
    assert.strictEqual(bobState.channels[dmChannelId].messages[0].content, secretText);
    assert.strictEqual(bobState.channels[dmChannelId].messages[0].author.id, 'user_alice');
  });
});
