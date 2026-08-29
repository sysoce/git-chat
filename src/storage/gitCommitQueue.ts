import type { SyncFileItem } from './gitSyncEngine.js';
import type { OfflineQueue } from './offlineQueue.js';

export interface GitCommitQueueOptions {
  pusher: (files: SyncFileItem[]) => Promise<string>;
  offlineQueue?: OfflineQueue;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface PushResult {
  success: boolean;
  commitSha?: string;
  queuedOffline?: boolean;
  error?: string;
}

export class GitCommitQueue {
  private queue: Promise<any> = Promise.resolve();
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(private readonly options: GitCommitQueueOptions) {
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 300;
  }

  public async push(files: SyncFileItem[]): Promise<PushResult> {
    const task = this.queue.then(() => this.executePush(files));
    this.queue = task.catch(() => {});
    return task;
  }

  private async executePush(files: SyncFileItem[]): Promise<PushResult> {
    let lastError = '';
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const commitSha = await this.options.pusher(files);
        return { success: true, commitSha };
      } catch (err: any) {
        lastError = err?.message || String(err);
        const isOffline = /Failed to fetch|NetworkError|offline|ENOTFOUND/i.test(lastError);
        if (isOffline && this.options.offlineQueue) {
          this.options.offlineQueue.enqueue(files);
          return { success: false, queuedOffline: true, error: lastError };
        }
        if (attempt < this.maxRetries) {
          const delay = this.retryDelayMs * Math.pow(1.5, attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    if (this.options.offlineQueue) {
      this.options.offlineQueue.enqueue(files);
      return { success: false, queuedOffline: true, error: lastError };
    }

    return { success: false, queuedOffline: false, error: lastError };
  }
}
