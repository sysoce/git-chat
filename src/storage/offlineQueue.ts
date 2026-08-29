import type { SyncFileItem } from './gitSyncEngine.js';

export interface QueueItem {
  id: string;
  files: SyncFileItem[];
  timestamp: number;
  retryCount: number;
}

export class OfflineQueue {
  private items: QueueItem[] = [];
  private storageKey: string | null = null;

  constructor(storageKey?: string) {
    if (storageKey) {
      this.storageKey = storageKey;
      this.loadFromStorage();
    }
  }

  public size(): number {
    return this.items.length;
  }

  public getItems(): QueueItem[] {
    return [...this.items];
  }

  public enqueue(files: SyncFileItem[]): QueueItem {
    const item: QueueItem = {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      files,
      timestamp: Date.now(),
      retryCount: 0,
    };
    this.items.push(item);
    this.saveToStorage();
    return item;
  }

  public peek(): QueueItem | undefined {
    return this.items[0];
  }

  public dequeue(): QueueItem | undefined {
    const item = this.items.shift();
    if (item) this.saveToStorage();
    return item;
  }

  public async drain(processor: (files: SyncFileItem[]) => Promise<boolean>): Promise<number> {
    let processed = 0;
    while (this.items.length > 0) {
      const current = this.items[0];
      try {
        const ok = await processor(current.files);
        if (ok) {
          this.items.shift();
          this.saveToStorage();
          processed++;
        } else {
          current.retryCount++;
          this.saveToStorage();
          break;
        }
      } catch {
        current.retryCount++;
        this.saveToStorage();
        break;
      }
    }
    return processed;
  }

  private saveToStorage(): void {
    if (!this.storageKey || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.items));
    } catch {}
  }

  private loadFromStorage(): void {
    if (!this.storageKey || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) this.items = parsed;
      }
    } catch {}
  }
}
