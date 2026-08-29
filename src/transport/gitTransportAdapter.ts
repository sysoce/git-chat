import type { TransportAdapter, TransportStatus, TransportMessage } from './types.js';
import { ChatRemoteClient } from '../backend/chatRemoteClient.js';

export interface GitTransportConfig {
  owner: string;
  repo: string;
  branch?: string;
  token?: string;
  userId: string;
  pollIntervalMs?: number;
}

export class GitTransportAdapter implements TransportAdapter {
  public readonly mode = 'git-sync';
  public readonly priority = 4;
  public readonly name = 'GitHub Git Sync';

  private status: TransportStatus = 'disconnected';
  private client: ChatRemoteClient;
  private pollIntervalMs: number;
  private pollTimer: any = null;
  private statusListeners = new Set<(s: TransportStatus) => void>();
  private messageListeners = new Set<(m: TransportMessage) => void>();

  constructor(private config: GitTransportConfig) {
    this.client = new ChatRemoteClient({
      owner: config.owner,
      repo: config.repo,
      branch: config.branch || 'git-chat',
      token: config.token,
    });
    this.pollIntervalMs = config.pollIntervalMs || 10000;
  }

  public getStatus(): TransportStatus {
    return this.status;
  }

  public async connect(): Promise<boolean> {
    if (this.status === 'connected') return true;
    this.setStatus('connecting');

    try {
      await this.pollOnce();
      this.setStatus('connected');
      this.startPolling();
      return true;
    } catch {
      this.setStatus('connected'); // Tolerates initial empty repo
      this.startPolling();
      return true;
    }
  }

  public disconnect(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.setStatus('disconnected');
  }

  public async send(message: TransportMessage): Promise<boolean> {
    if (!this.config.token) return false;
    if (!message.path || !message.content) return false;

    try {
      await this.client.pushFiles(
        [{ path: message.path, content: message.content }],
        this.config.userId,
        `git-chat: discrete update ${message.path}`
      );
      return true;
    } catch {
      return false;
    }
  }

  public onMessage(listener: (msg: TransportMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onStatusChange(listener: (status: TransportStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private startPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      this.pollOnce().catch(() => {});
    }, this.pollIntervalMs);
  }

  private async pollOnce(): Promise<void> {
    const res = await this.client.pullUpdates();
    if (res.isModified && res.files.length > 0) {
      for (const f of res.files) {
        const msg: TransportMessage = {
          id: `git_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'sync_file',
          path: f.path,
          content: f.content,
          timestamp: Date.now(),
          senderId: 'github_sync',
        };
        for (const l of this.messageListeners) l(msg);
      }
    }
  }

  private setStatus(s: TransportStatus): void {
    if (this.status !== s) {
      this.status = s;
      for (const l of this.statusListeners) l(s);
    }
  }
}
