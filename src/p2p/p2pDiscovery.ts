export interface P2PDiscoveryOptions {
  localPeerId: string;
  onAnnounce?: (localPeerId: string) => void;
  peerTtlMs?: number;
}

export class P2PDiscovery {
  private localPeerId: string;
  private onAnnounce?: (localPeerId: string) => void;
  private peerTtlMs: number;
  private knownPeers = new Map<string, number>();
  private timer: any = null;

  constructor(options: P2PDiscoveryOptions) {
    this.localPeerId = options.localPeerId;
    this.onAnnounce = options.onAnnounce;
    this.peerTtlMs = options.peerTtlMs ?? 60000;
  }

  public startPeriodicAnnounce(intervalMs = 25000): void {
    this.announce();
    this.stop();
    this.timer = setInterval(() => {
      this.announce();
      this.pruneStalePeers();
    }, intervalMs);
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public announce(): void {
    if (this.onAnnounce) {
      this.onAnnounce(this.localPeerId);
    }
  }

  public recordPeerPresence(peerId: string, timestamp = Date.now()): void {
    if (!peerId || peerId === this.localPeerId) return;
    this.knownPeers.set(peerId, timestamp);
  }

  public hasPeer(peerId: string): boolean {
    return this.knownPeers.has(peerId);
  }

  public getKnownPeers(): string[] {
    return Array.from(this.knownPeers.keys());
  }

  public pruneStalePeers(now = Date.now()): void {
    for (const [peerId, lastSeen] of this.knownPeers.entries()) {
      if (now - lastSeen > this.peerTtlMs) {
        this.knownPeers.delete(peerId);
      }
    }
  }
}
