import type { TransportAdapter, TransportStatus, TransportMessage } from './types.js';
import { GistClient, type GistSyncConfig } from '../storage/gistClient.js';
import { computeClientPollInterval, computeQuotaSafeIntervalMs } from './syncPollingPolicy.js';

export interface GistTransportOptions {
  config: GistSyncConfig;
  gistClient?: GistClient;
  pollIntervalMs?: number;
}

export class GistTransportAdapter implements TransportAdapter {
  public readonly mode = 'gist-sync';
  public readonly priority = 4;
  public readonly name = 'GitHub Gist Sync';

  private status: TransportStatus = 'disconnected';
  private gistClient: GistClient;
  private pollTimer?: any;
  private isPolling = false;
  private statusListeners = new Set<(s: TransportStatus) => void>();
  private messageListeners = new Set<(m: TransportMessage) => void>();

  constructor(private readonly options: GistTransportOptions) {
    this.gistClient = options.gistClient || new GistClient(options.config);
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
      this.scheduleNextPoll();
      return true;
    } catch {
      this.setStatus('failed');
      return false;
    }
  }

  public disconnect(): void {
    this.stopPolling();
    this.setStatus('disconnected');
  }

  public async send(message: TransportMessage): Promise<boolean> {
    if (!message.path || !message.content) return false;
    try {
      await this.gistClient.pushSyncFile(message.path, message.content);
      void this.pollOnce();
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

  private setStatus(s: TransportStatus): void {
    if (this.status !== s) {
      this.status = s;
      for (const l of this.statusListeners) l(s);
    }
  }

  private scheduleNextPoll(): void {
    this.stopPolling();
    if (this.status !== 'connected') return;

    const rateLimit = this.gistClient.getRateLimitInfo();
    const behavioural = computeClientPollInterval({
      remainingQuota: rateLimit.remaining,
      isHidden: typeof document !== 'undefined' ? document.hidden : false,
    });
    // A single gist read per poll, paced so the reported quota outlives the window.
    const quotaFloor = computeQuotaSafeIntervalMs({
      remaining: rateLimit.remaining,
      resetAtMs: rateLimit.resetAt,
      requestsPerPoll: 1,
    });
    const interval = this.options.pollIntervalMs || Math.max(behavioural, quotaFloor);

    this.pollTimer = setTimeout(async () => {
      await this.pollOnce();
      if (this.status === 'connected') this.scheduleNextPoll();
    }, interval);

    if (typeof (this.pollTimer as any)?.unref === 'function') {
      (this.pollTimer as any).unref();
    }
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  private async pollOnce(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const res = await this.gistClient.fetchSyncState();
      if (!res.notModified && res.data?.files) {
        for (const file of res.data.files) {
          const tMsg: TransportMessage = {
            id: `gist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'sync_file',
            path: file.path,
            content: file.content,
            timestamp: Date.now(),
          };
          for (const listener of this.messageListeners) {
            listener(tMsg);
          }
        }
      }
    } finally {
      this.isPolling = false;
    }
  }
}
