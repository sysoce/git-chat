import type { TransportAdapter, TransportStatus, TransportMessage } from './types.js';

export interface SseTransportConfig {
  baseUrl: string;
  userId: string;
}

export class SseTransportAdapter implements TransportAdapter {
  public readonly mode = 'live-sse';
  public readonly priority = 3;
  public readonly name = 'Live SSE Bridge';

  private status: TransportStatus = 'disconnected';
  private eventSource: any = null;
  private statusListeners = new Set<(s: TransportStatus) => void>();
  private messageListeners = new Set<(m: TransportMessage) => void>();

  constructor(private config: SseTransportConfig) {}

  public getStatus(): TransportStatus {
    return this.status;
  }

  public async connect(): Promise<boolean> {
    if (typeof EventSource === 'undefined') {
      this.setStatus('failed');
      return false;
    }
    this.setStatus('connecting');

    const cleanBase = this.config.baseUrl.replace(/\/+$/, '');
    const sseUrl = `${cleanBase}/api/events`;

    try {
      this.eventSource = new EventSource(sseUrl);

      this.eventSource.onopen = () => {
        this.setStatus('connected');
      };

      this.eventSource.addEventListener('sync_files', (evt: any) => {
        try {
          const data = JSON.parse(evt.data);
          if (data.files && Array.isArray(data.files)) {
            for (const f of data.files) {
              const msg: TransportMessage = {
                id: `sse_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                type: 'sync_file',
                path: f.relativePath,
                content: f.content,
                timestamp: Date.now(),
                senderId: 'server_stream',
              };
              for (const l of this.messageListeners) l(msg);
            }
          }
        } catch {}
      });

      this.eventSource.onerror = () => {
        this.setStatus('disconnected');
      };

      return true;
    } catch {
      this.setStatus('failed');
      return false;
    }
  }

  public disconnect(): void {
    if (this.eventSource) {
      try { this.eventSource.close(); } catch {}
      this.eventSource = null;
    }
    this.setStatus('disconnected');
  }

  public async send(message: TransportMessage): Promise<boolean> {
    if (this.status !== 'connected') return false;
    const cleanBase = this.config.baseUrl.replace(/\/+$/, '');
    const pushUrl = `${cleanBase}/api/sync/push`;

    const files = message.path && message.content
      ? [{ relativePath: message.path, content: message.content }]
      : [];

    if (files.length === 0) return false;

    try {
      const res = await fetch(pushUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Active-User': this.config.userId,
        },
        body: JSON.stringify({
          activeUserId: this.config.userId,
          files,
        }),
      });
      return res.ok;
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
}
