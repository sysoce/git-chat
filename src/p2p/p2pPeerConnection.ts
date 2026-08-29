import { getDefaultIceServers } from './p2pIceConfig.js';
import { P2PDataChannel } from './p2pDataChannel.js';
import { createOfferSignal, createAnswerSignal, createCandidateSignal } from './p2pSignaler.js';
import type {
  P2PConnectionOptions,
  P2PConnectionState,
  P2PSignalMessage,
  P2PDataMessage,
} from './types.js';

export class P2PPeerConnection {
  private pc: RTCPeerConnection | null = null;
  private dataChannel: P2PDataChannel | null = null;
  private state: P2PConnectionState = 'disconnected';
  private pendingCandidates: RTCIceCandidateInit[] = [];

  constructor(private options: P2PConnectionOptions) {}

  public getState(): P2PConnectionState {
    return this.state;
  }

  public getDataChannel(): P2PDataChannel | null {
    return this.dataChannel;
  }

  public async initialize(): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') {
      this.setState('failed');
      return;
    }

    const iceServers = this.options.iceServers || getDefaultIceServers();
    this.pc = new RTCPeerConnection({ iceServers });
    this.setState('connecting');

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.options.onSignal && this.options.remotePeerId) {
        const signal = createCandidateSignal(
          this.options.peerId,
          this.options.remotePeerId,
          event.candidate.toJSON()
        );
        this.options.onSignal(signal);
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      const cs = this.pc.connectionState;
      if (cs === 'connected') this.setState('connected');
      else if (cs === 'disconnected' || cs === 'closed') this.setState('disconnected');
      else if (cs === 'failed') this.setState('failed');
    };

    if (this.options.isInitiator) {
      const rawDc = this.pc.createDataChannel('git-chat-mesh');
      this.attachDataChannel(rawDc);
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      if (this.options.onSignal && this.options.remotePeerId) {
        this.options.onSignal(
          createOfferSignal(this.options.peerId, this.options.remotePeerId, offer)
        );
      }
    } else {
      this.pc.ondatachannel = (event) => {
        this.attachDataChannel(event.channel);
      };
    }
  }

  public async handleSignal(signal: P2PSignalMessage): Promise<void> {
    if (!this.pc) await this.initialize();
    if (!this.pc) return;

    if (signal.type === 'offer' && signal.sdp) {
      await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      for (const cand of this.pendingCandidates) {
        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
      }
      this.pendingCandidates = [];
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);
      if (this.options.onSignal) {
        this.options.onSignal(
          createAnswerSignal(this.options.peerId, signal.senderId, answer)
        );
      }
    } else if (signal.type === 'answer' && signal.sdp) {
      await this.pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      for (const cand of this.pendingCandidates) {
        await this.pc.addIceCandidate(new RTCIceCandidate(cand));
      }
      this.pendingCandidates = [];
    } else if (signal.type === 'candidate' && signal.candidate) {
      if (this.pc.remoteDescription) {
        await this.pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } else {
        this.pendingCandidates.push(signal.candidate);
      }
    }
  }

  public send(msg: P2PDataMessage): boolean {
    if (this.dataChannel && this.dataChannel.isOpen()) {
      return this.dataChannel.send(msg);
    }
    return false;
  }

  public close(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.pc) {
      try { this.pc.close(); } catch {}
      this.pc = null;
    }
    this.setState('closed');
  }

  private attachDataChannel(rawDc: RTCDataChannel): void {
    this.dataChannel = new P2PDataChannel(rawDc);
    this.dataChannel.onMessage((msg) => {
      this.options.onDataMessage?.(msg);
    });
    this.dataChannel.onClose(() => {
      this.setState('disconnected');
    });
    if (rawDc.readyState === 'open') {
      this.setState('connected');
    } else {
      rawDc.onopen = () => this.setState('connected');
    }
  }

  private setState(newState: P2PConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.options.onStateChange?.(newState);
    }
  }
}
