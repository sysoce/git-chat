import type { TransportAdapter, TransportStatus, TransportMessage } from '../transport/types.js';
import { P2PPeerConnection } from './p2pPeerConnection.js';
import { P2PHeartbeat } from './p2pHeartbeat.js';
import type { P2PConnectionOptions, P2PSignalMessage, P2PDataMessage } from './types.js';

export interface P2PTransportConfig {
  peerId: string;
  remotePeerId?: string;
  isInitiator?: boolean;
  iceServers?: RTCIceServer[];
  onSignal?: (signal: P2PSignalMessage) => void;
}

export class P2PTransportAdapter implements TransportAdapter {
  public readonly mode = 'p2p';
  public readonly priority = 1;
  public readonly name = 'WebRTC P2P';

  private status: TransportStatus = 'disconnected';
  private peerConn: P2PPeerConnection | null = null;
  private heartbeat: P2PHeartbeat | null = null;
  private statusListeners = new Set<(s: TransportStatus) => void>();
  private messageListeners = new Set<(m: TransportMessage) => void>();

  constructor(private config: P2PTransportConfig) {}

  public getStatus(): TransportStatus {
    return this.status;
  }

  public async connect(): Promise<boolean> {
    if (this.status === 'connected') return true;
    this.setStatus('connecting');

    const opts: P2PConnectionOptions = {
      peerId: this.config.peerId,
      remotePeerId: this.config.remotePeerId,
      isInitiator: this.config.isInitiator,
      iceServers: this.config.iceServers,
      onSignal: this.config.onSignal,
      onDataMessage: (dataMsg) => this.handleIncomingData(dataMsg),
      onStateChange: (state) => {
        const isConn = state === 'connected';
        this.setStatus(isConn ? 'connected' : state === 'connecting' ? 'connecting' : state === 'failed' ? 'failed' : 'disconnected');
        if (isConn) this.heartbeat?.start();
        else this.heartbeat?.stop();
      },
    };

    this.peerConn = new P2PPeerConnection(opts);
    this.heartbeat = new P2PHeartbeat({
      sendPing: () => this.peerConn?.send({ type: 'ping', senderId: this.config.peerId, timestamp: Date.now() }),
      onTimeout: () => this.setStatus('disconnected'),
    });

    try {
      await this.peerConn.initialize();
      return true;
    } catch {
      this.setStatus('failed');
      return false;
    }
  }

  public disconnect(): void {
    this.heartbeat?.stop();
    this.peerConn?.close();
    this.peerConn = null;
    this.setStatus('disconnected');
  }

  public async send(message: TransportMessage): Promise<boolean> {
    if (this.status !== 'connected' || !this.peerConn) return false;
    const dataMsg: P2PDataMessage = {
      type: message.type,
      path: message.path,
      content: message.content,
      payload: message.payload,
      timestamp: message.timestamp || Date.now(),
      senderId: message.senderId || this.config.peerId,
    };
    return this.peerConn.send(dataMsg);
  }

  public handleSignal(signal: P2PSignalMessage): Promise<void> {
    if (!this.peerConn) return Promise.resolve();
    return this.peerConn.handleSignal(signal);
  }

  public onMessage(listener: (msg: TransportMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onStatusChange(listener: (status: TransportStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private handleIncomingData(dataMsg: P2PDataMessage): void {
    if (dataMsg.type === 'ping') {
      this.heartbeat?.handlePing();
      this.peerConn?.send({
        type: 'pong',
        senderId: this.config.peerId,
        timestamp: Date.now(),
      });
      return;
    }
    if (dataMsg.type === 'pong') {
      this.heartbeat?.handlePong();
      return;
    }

    const tMsg: TransportMessage = {
      id: `p2p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: dataMsg.type,
      path: dataMsg.path,
      content: dataMsg.content,
      payload: dataMsg.payload,
      timestamp: dataMsg.timestamp,
      senderId: dataMsg.senderId,
    };

    for (const listener of this.messageListeners) {
      listener(tMsg);
    }
  }

  private setStatus(s: TransportStatus): void {
    if (this.status !== s) {
      this.status = s;
      for (const l of this.statusListeners) l(s);
    }
  }
}
