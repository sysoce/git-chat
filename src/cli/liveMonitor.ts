import { LiveMeshRelay } from '../engine/liveMeshRelay.js';
import { deriveVaultKey, encryptContent, decryptContent } from '../security/cryptoVault.js';
import { generateAgentResponse, createAgentMessage } from '../engine/agentResponder.js';
import type { ChatMessage } from '../types/chat.js';

interface MonitorConfig {
  owner: string;
  repo: string;
  vaultPass: string;
}

export class LiveMonitor {
  private relay: LiveMeshRelay;
  private vaultKey: any = null;
  private processedMsgIds = new Set<string>();

  constructor(private config: MonitorConfig) {
    this.relay = new LiveMeshRelay({
      owner: config.owner,
      repo: config.repo,
      userId: 'agent_human',
      onFileReceived: (fPath, content) => this.handleSyncFile(fPath, content),
      onStatusChange: (s) => console.log(`📡 Live Mesh status: ${s}`),
    });
  }

  public async start(): Promise<void> {
    this.vaultKey = await deriveVaultKey(this.config.vaultPass);
    console.log(`🚀 Starting git-chat live monitor for ${this.config.owner}/${this.config.repo}...`);
    console.log(`📡 Topic: ${this.relay.getWorkspaceTopic()}`);
    this.relay.connect();

    setInterval(() => {
      console.log(`💓 [${new Date().toISOString()}] git-chat live monitor active and listening for mobile messages...`);
    }, 30000);
  }

  private async handleSyncFile(filePath: string, contentStr: string): Promise<void> {
    if (!filePath.includes('/messages/') && !filePath.includes('/threads/')) return;

    try {
      const parsed: ChatMessage = JSON.parse(contentStr);
      if (!parsed.id || this.processedMsgIds.has(parsed.id)) return;
      this.processedMsgIds.add(parsed.id);

      if (parsed.author?.id === 'agent_human') return;

      let plainText = parsed.content || '';
      if ((!plainText || plainText === '[Encrypted Message]') && parsed.encrypted && this.vaultKey) {
        try {
          plainText = await decryptContent(parsed.encrypted, this.vaultKey);
        } catch {
          // Fallback
        }
      }

      const authorName = parsed.author?.name || parsed.author?.id || 'Unknown';
      console.log(`\n📬 [NEW MESSAGE RECEIVED] [${new Date().toLocaleTimeString()}]`);
      console.log(`  👤 Author:  ${authorName} (${parsed.author?.id || 'anon'})`);
      console.log(`  💬 Channel: ${parsed.channelId}`);
      console.log(`  📝 Content: "${plainText}"`);

      await this.sendAgentReply(parsed, plainText, authorName);
    } catch (e) {
      console.error('Error handling sync file:', e);
    }
  }

  private async sendAgentReply(msg: ChatMessage, text: string, authorName: string): Promise<void> {
    const isTalkChan = msg.channelId === 'chan_talk_to_a_human' || msg.channelId.includes('agent_human');
    const isMention = /(@Human|@human|@agent|@SupervisorAgent|\/human|\/agent|\/ask)/i.test(text);

    if (!isTalkChan && !isMention) {
      console.log(`  ℹ️ Message is not in #Talk to a Human and did not mention @Human. Standing by.`);
      return;
    }

    const replyText = generateAgentResponse(text, { channelName: msg.channelId, userName: authorName });
    const replyMsg = createAgentMessage(msg.channelId, replyText, msg.threadRootId);

    if (this.vaultKey) {
      try {
        const encrypted = await encryptContent(replyText, this.vaultKey);
        replyMsg.encrypted = encrypted;
      } catch {}
    }

    const replyPath = `channels/${msg.channelId}/messages/${replyMsg.id}.json`;
    const payload = this.relay.createSyncFilePayload(replyPath, JSON.stringify(replyMsg, null, 2));

    this.processedMsgIds.add(replyMsg.id);
    this.relay.publish(payload);

    console.log(`🤖 [AI REPLY DISPATCHED] -> ${msg.channelId}:`);
    console.log(`  "${replyText.slice(0, 120)}..."\n`);
  }
}

// Auto-run if executed directly
if (typeof require !== 'undefined' && require.main === module) {
  const mon = new LiveMonitor({
    owner: process.env.GIT_CHAT_OWNER || 'sysoce',
    repo: process.env.GIT_CHAT_REPO || 'chat-data',
    vaultPass: process.env.GIT_CHAT_PASS || 'git-chat-open',
  });
  mon.start().catch(console.error);
}
