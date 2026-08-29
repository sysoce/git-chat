import type { P2PIceCandidate } from './types.js';

export interface P2PNegotiatorOptions {
  localPeerId: string;
  remotePeerId?: string;
}

export class P2PNegotiator {
  private localPeerId: string;
  private remotePeerId: string;
  private makingOffer = false;
  private pendingCandidates: P2PIceCandidate[] = [];

  constructor(options: P2PNegotiatorOptions) {
    this.localPeerId = options.localPeerId;
    this.remotePeerId = options.remotePeerId || '';
  }

  public setRemotePeerId(id: string): void {
    this.remotePeerId = id;
  }

  public getRemotePeerId(): string {
    return this.remotePeerId;
  }

  public isPolite(): boolean {
    if (!this.remotePeerId) return false;
    return this.localPeerId < this.remotePeerId;
  }

  public setMakingOffer(val: boolean): void {
    this.makingOffer = val;
  }

  public isMakingOffer(): boolean {
    return this.makingOffer;
  }

  public shouldIgnoreOffer(signalingState: string): boolean {
    const isOfferCollision = this.makingOffer || signalingState !== 'stable';
    return isOfferCollision && !this.isPolite();
  }

  public shouldRollback(signalingState: string): boolean {
    const isOfferCollision = this.makingOffer || signalingState !== 'stable';
    return isOfferCollision && this.isPolite();
  }

  public bufferCandidate(candidate: P2PIceCandidate): void {
    this.pendingCandidates.push(candidate);
  }

  public getPendingCandidates(): P2PIceCandidate[] {
    return [...this.pendingCandidates];
  }

  public flushPendingCandidates(): P2PIceCandidate[] {
    const flushed = this.pendingCandidates;
    this.pendingCandidates = [];
    return flushed;
  }
}
