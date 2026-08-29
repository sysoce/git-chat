export interface P2PHeartbeatOptions {
  intervalMs?: number;
  timeoutMs?: number;
  sendPing: () => void;
  onTimeout: () => void;
}

export class P2PHeartbeat {
  private intervalMs: number;
  private timeoutMs: number;
  private sendPing: () => void;
  private onTimeout: () => void;
  private pingTimer: any = null;
  private timeoutTimer: any = null;
  private running = false;

  constructor(options: P2PHeartbeatOptions) {
    this.intervalMs = options.intervalMs || 10000;
    this.timeoutMs = options.timeoutMs || 25000;
    this.sendPing = options.sendPing;
    this.onTimeout = options.onTimeout;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.schedulePing();
    this.resetTimeout();
  }

  public stop(): void {
    this.running = false;
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  public handlePing(): void {
    this.resetTimeout();
  }

  public handlePong(): void {
    this.resetTimeout();
  }

  private schedulePing(): void {
    this.pingTimer = setInterval(() => {
      if (!this.running) return;
      try {
        this.sendPing();
      } catch {}
    }, this.intervalMs);
  }

  private resetTimeout(): void {
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
    }
    if (!this.running) return;
    this.timeoutTimer = setTimeout(() => {
      if (this.running) {
        this.onTimeout();
      }
    }, this.timeoutMs);
  }
}
