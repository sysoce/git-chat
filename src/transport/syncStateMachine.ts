import { LiveReachabilityProbe } from './liveReachabilityProbe.js';

export type TransportSyncMode = 'p2p' | 'live-sse' | 'live-mesh' | 'git-sync' | 'gist-sync' | 'offline';

export interface SyncStateMachineOptions {
  initialMode?: TransportSyncMode;
  autoFallback?: boolean;
  baseUrl?: string;
  onModeChange?: (mode: TransportSyncMode) => void;
  onStatusChange?: (status: string) => void;
  onLiveServerReachable?: () => void;
  onError?: (err: string) => void;
}

export class SyncStateMachine {
  private mode: TransportSyncMode;
  private autoFallback: boolean;
  private reachabilityProbe: LiveReachabilityProbe;

  constructor(private readonly options: SyncStateMachineOptions = {}) {
    this.mode = options.initialMode || 'live-sse';
    this.autoFallback = options.autoFallback ?? true;

    this.reachabilityProbe = new LiveReachabilityProbe({
      baseUrl: options.baseUrl,
      onReachable: () => {
        this.triggerLiveServerReachable();
      },
    });
  }

  public getMode(): TransportSyncMode {
    return this.mode;
  }

  public setMode(newMode: TransportSyncMode): void {
    if (this.mode !== newMode) {
      this.mode = newMode;
      this.options.onModeChange?.(newMode);
    }
    if (newMode === 'live-sse' || newMode === 'p2p' || newMode === 'live-mesh') {
      this.reachabilityProbe.stop();
    }
  }

  public handlePrimarySseFailure(): void {
    if (!this.autoFallback) {
      this.options.onStatusChange?.('disconnected');
      return;
    }

    // Fallback to git-sync or gist-sync backup
    this.setMode('git-sync');
    this.options.onStatusChange?.('syncing');
    this.reachabilityProbe.start();
  }

  public triggerLiveServerReachable(): void {
    this.options.onLiveServerReachable?.();
  }

  public restorePrimaryLive(): void {
    this.reachabilityProbe.stop();
    this.setMode('live-sse');
    this.options.onStatusChange?.('connected');
  }

  public stop(): void {
    this.reachabilityProbe.stop();
  }
}
