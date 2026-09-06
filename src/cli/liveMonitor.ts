import { LiveMeshRelay } from '../engine/liveMeshRelay.js';
import { deriveVaultKey, decryptContentWithFallbacks } from '../security/cryptoVault.js';
import { GitSyncWatcher } from './gitSyncWatcher.js';
import type { ChatMessage } from '../types/chat.js';

interface MonitorConfig {
  owner: string;
  repo: string;
  vaultPass: string;
}

export class LiveMonitor {
  private relays: LiveMeshRelay[] = [];
  private watchers: GitSyncWatcher[] = [];
  private processedMsgIds = new Set<string>();

  constructor(private config: MonitorConfig) {
    const repos = Array.from(new Set([config.repo, 'chat-data', 'git-chat']));
    for (const r of repos) {
      this.relays.push(
        new LiveMeshRelay({
          owner: config.owner,
          repo: r,
          userId: 'monitor_user',
          onFileReceived: (fPath, content) => this.handleSyncFile(fPath, content, r),
          onStatusChange: (s) => console.log(`📡 Live Mesh [${r}] status: ${s}`),
        })
      );
      this.watchers.push(
        new GitSyncWatcher({
          owner: config.owner,
          repo: r,
          onNewMessageFile: (fPath, content) => this.handleSyncFile(fPath, content, r),
        })
      );
    }
  }

  public async start(): Promise<void> {
    console.log(`🚀 Starting git-chat live monitor for ${this.config.owner}...`);
    for (const relay of this.relays) {
      console.log(`📡 Topic: ${relay.getWorkspaceTopic()}`);
      relay.connect();
    }
    for (const watcher of this.watchers) {
      watcher.start(8000);
    }

    setInterval(() => {
      console.log(`💓 [${new Date().toISOString()}] git-chat live monitor active across Mesh & Git...`);
    }, 30000);
  }

  private async handleSyncFile(filePath: string, contentStr: string, repo: string): Promise<void> {
    if (!filePath.includes('/messages/') && !filePath.includes('/threads/')) return;

    try {
      const parsed: ChatMessage = JSON.parse(contentStr);
      if (!parsed.id || this.processedMsgIds.has(parsed.id)) return;
      this.processedMsgIds.add(parsed.id);

      let plainText = parsed.content || '';
      if ((!plainText || plainText === '[Encrypted Message]') && parsed.encrypted) {
        const chanId = parsed.channelId || 'chan_general';
        const candidateKeys = await Promise.all([
          deriveVaultKey(this.config.vaultPass, `git-chat-chan-${this.config.owner}-${repo}-${chanId}`),
          deriveVaultKey(this.config.vaultPass, `git-chat-chan-${this.config.owner}-chat-data-${chanId}`),
          deriveVaultKey(this.config.vaultPass, `git-chat-chan-${this.config.owner}-git-chat-${chanId}`),
          deriveVaultKey(this.config.vaultPass, 'git-chat-e2ee-vault-salt'),
        ]);
        try {
          plainText = await decryptContentWithFallbacks(parsed.encrypted, candidateKeys);
        } catch {}
      }

      const authorName = parsed.author?.name || parsed.author?.id || 'Unknown';
      console.log(`\n📬 [NEW MESSAGE FROM FIELD] [${new Date().toLocaleTimeString()}]`);
      console.log(`  👤 Author:  ${authorName} (${parsed.author?.id || 'anon'})`);
      console.log(`  💬 Channel: ${parsed.channelId} [Repo: ${repo}]`);
      console.log(`  📝 Content: "${plainText}"`);
    } catch (e) {
      console.error('Error handling sync file:', e);
    }
  }
}

if (typeof process !== 'undefined' && process.argv[1] && process.argv[1].includes('liveMonitor')) {
  const mon = new LiveMonitor({
    owner: process.env.GIT_CHAT_OWNER || 'sysoce',
    repo: process.env.GIT_CHAT_REPO || 'chat-data',
    vaultPass: process.env.GIT_CHAT_PASS || 'git-chat-open',
  });
  mon.start().catch(console.error);
}
