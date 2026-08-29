import type { P2PDataMessage } from './types.js';

export class P2PDataChannel {
  private messageListeners = new Set<(msg: P2PDataMessage) => void>();
  private closeListeners = new Set<() => void>();

  constructor(private channel: RTCDataChannel) {
    this.setupListeners();
  }

  public isOpen(): boolean {
    return this.channel.readyState === 'open';
  }

  public send(msg: P2PDataMessage): boolean {
    if (!this.isOpen()) return false;
    try {
      this.channel.send(JSON.stringify(msg));
      return true;
    } catch {
      return false;
    }
  }

  public onMessage(listener: (msg: P2PDataMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onClose(listener: () => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  public close(): void {
    try {
      this.channel.close();
    } catch {}
  }

  private setupListeners(): void {
    this.channel.onmessage = (event: MessageEvent) => {
      try {
        const raw = typeof event.data === 'string' ? event.data : '';
        if (!raw) return;
        const msg = JSON.parse(raw) as P2PDataMessage;
        for (const l of this.messageListeners) {
          l(msg);
        }
      } catch {}
    };

    this.channel.onclose = () => {
      for (const l of this.closeListeners) {
        l();
      }
    };

    this.channel.onerror = () => {
      for (const l of this.closeListeners) {
        l();
      }
    };
  }
}
