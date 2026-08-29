import type { TransportAdapter, TransportMessage } from './types.js';

export class TransportRegistry {
  private transports = new Map<string, TransportAdapter>();
  private statusListeners = new Map<string, () => void>();
  private activeListeners = new Set<(active: TransportAdapter | null) => void>();
  private messageListeners = new Set<(msg: TransportMessage, adapter: TransportAdapter) => void>();
  private activeTransport: TransportAdapter | null = null;

  public register(adapter: TransportAdapter): void {
    if (this.transports.has(adapter.mode)) {
      this.unregister(adapter.mode);
    }
    this.transports.set(adapter.mode, adapter);

    const unsubStatus = adapter.onStatusChange(() => {
      this.evaluateActiveTransport();
    });

    const unsubMsg = adapter.onMessage((msg) => {
      for (const listener of this.messageListeners) {
        listener(msg, adapter);
      }
    });

    this.statusListeners.set(adapter.mode, () => {
      unsubStatus();
      unsubMsg();
    });

    this.evaluateActiveTransport();
  }

  public unregister(mode: string): void {
    const unsub = this.statusListeners.get(mode);
    if (unsub) {
      unsub();
      this.statusListeners.delete(mode);
    }
    this.transports.delete(mode);
    this.evaluateActiveTransport();
  }

  public getTransport(mode: string): TransportAdapter | undefined {
    return this.transports.get(mode);
  }

  public getAllTransports(): TransportAdapter[] {
    return Array.from(this.transports.values()).sort((a, b) => a.priority - b.priority);
  }

  public getBestAvailableTransport(): TransportAdapter | null {
    const sorted = this.getAllTransports();
    for (const adapter of sorted) {
      if (adapter.getStatus() === 'connected') {
        return adapter;
      }
    }
    return null;
  }

  public getActiveTransport(): TransportAdapter | null {
    return this.activeTransport;
  }

  public async broadcast(message: TransportMessage): Promise<boolean> {
    const active = this.getBestAvailableTransport();
    if (!active) return false;
    return active.send(message);
  }

  public onActiveTransportChange(listener: (active: TransportAdapter | null) => void): () => void {
    this.activeListeners.add(listener);
    return () => this.activeListeners.delete(listener);
  }

  public onAnyMessage(listener: (msg: TransportMessage, adapter: TransportAdapter) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private evaluateActiveTransport(): void {
    const best = this.getBestAvailableTransport();
    if (this.activeTransport !== best) {
      this.activeTransport = best;
      for (const listener of this.activeListeners) {
        listener(best);
      }
    }
  }
}
