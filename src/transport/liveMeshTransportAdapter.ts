import type { TransportAdapter, TransportStatus, TransportMessage } from './types.js';
import { LiveMeshRelay, type LiveMeshOptions } from '../engine/liveMeshRelay.js';

export interface LiveMeshTransportConfig {
  owner: string;
  repo: string;
  secret?: string;
  userId: string;
  brokerUrls?: string[];
}

export class LiveMeshTransportAdapter implements TransportAdapter {
  public readonly mode = 'live-mesh';
  public readonly priority = 2;
  public readonly name = 'Live Mesh Relay';

  private status: TransportStatus = 'disconnected';
  private relay: LiveMeshRelay | null = null;
  private statusListeners = new Set<(s: TransportStatus) => void>();
  private messageListeners = new Set<(m: TransportMessage) => void>();

  constructor(private config: LiveMeshTransportConfig) {}

  public getStatus(): TransportStatus {
    return this.status;
  }

  public async connect(): Promise<boolean> {
    if (this.status === 'connected') return true;
    this.setStatus('connecting');

    const opts: LiveMeshOptions = {
      owner: this.config.owner,
      repo: this.config.repo,
      secret: this.config.secret,
      userId: this.config.userId,
      brokerUrls: this.config.brokerUrls,
      onStatusChange: (s) => {
        if (s === 'connected') this.setStatus('connected');
        else if (s === 'connecting') this.setStatus('connecting');
        else this.setStatus('disconnected');
      },
      onFileReceived: (path, content) => {
        this.handleRelayFile(path, content);
      },
      onSyncRequested: () => {
        // Handled by client state catch-up
      },
    };

    this.relay = new LiveMeshRelay(opts);
    this.relay.connect();
    return true;
  }

  public disconnect(): void {
    if (this.relay) {
      this.relay.disconnect();
      this.relay = null;
    }
    this.setStatus('disconnected');
  }

  public async send(message: TransportMessage): Promise<boolean> {
    if (!this.relay || this.status !== 'connected') return false;

    if (message.path && message.content) {
      const payload = this.relay.createSyncFilePayload(message.path, message.content);
      return this.relay.publish(payload);
    }

    const genericPayload = {
      id: message.id,
      type: message.type,
      channelId: message.channelId,
      path: message.path,
      content: message.content,
      payload: message.payload,
      timestamp: message.timestamp || Date.now(),
      senderId: message.senderId || this.config.userId,
      recipientId: message.recipientId,
    };
    return this.relay.publish(genericPayload);
  }

  public onMessage(listener: (msg: TransportMessage) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  public onStatusChange(listener: (status: TransportStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private handleRelayFile(path: string, content: string): void {
    const msg: TransportMessage = {
      id: `mesh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'sync_file',
      path,
      content,
      timestamp: Date.now(),
      senderId: 'remote_peer',
    };
    for (const listener of this.messageListeners) {
      listener(msg);
    }
  }

  private setStatus(s: TransportStatus): void {
    if (this.status !== s) {
      this.status = s;
      for (const l of this.statusListeners) l(s);
    }
  }
}
