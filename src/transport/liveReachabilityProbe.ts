export interface ReachabilityProbeOptions {
  baseUrl?: string;
  onReachable: () => void;
  intervalMs?: number;
}

export class LiveReachabilityProbe {
  private timer?: any;
  private isChecking = false;

  constructor(private readonly opts: ReachabilityProbeOptions) {}

  start(): void {
    this.stop();
    const interval = this.opts.intervalMs || 15000;
    this.timer = setInterval(() => {
      void this.checkReachability();
    }, interval);
    if (typeof (this.timer as any)?.unref === 'function') {
      (this.timer as any).unref();
    }
  }

  async checkReachability(): Promise<boolean> {
    if (this.isChecking) return false;
    this.isChecking = true;
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeout = controller ? setTimeout(() => controller.abort(), 2500) : null;
      const base = (this.opts.baseUrl || '').replace(/\/+$/, '');
      const url = `${base}/api/version`;
      const res = await fetch(url, {
        signal: controller?.signal,
        cache: 'no-store',
      });
      if (timeout) clearTimeout(timeout);
      if (res && (res.ok || res.status === 401 || res.status === 403)) {
        this.opts.onReachable();
        return true;
      }
    } catch {
      // Server is currently unreachable
    } finally {
      this.isChecking = false;
    }
    return false;
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
}
