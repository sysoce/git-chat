// LiveMeshRelay: Real-time bi-directional peer mesh manager with multi-broker failover
import {
  encodeConnectPacket,
  encodePublishPacket,
  encodeSubscribePacket,
  encodePingPacket,
  parseMqttPacket,
  deriveWorkspaceTopic
} from './liveMeshClient.js';

export interface LiveMeshOptions {
  owner: string;
  repo: string;
  secret?: string;
  userId: string;
  brokerUrls?: string[];
  onFileReceived?: (path: string, content: string) => void;
  onSyncRequested?: (requesterId: string) => void;
  onStatusChange?: (status: 'connected' | 'connecting' | 'disconnected') => void;
}

const DEFAULT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081'
];

export class LiveMeshRelay {
  private options: LiveMeshOptions;
  private brokers: string[];
  private currentBrokerIdx = 0;
  private ws: any = null;
  private connected = false;
  private pingInterval: any = null;
  private clientId: string;
  private workspaceTopic: string;

  constructor(options: LiveMeshOptions) {
    this.options = options;
    this.brokers = options.brokerUrls && options.brokerUrls.length > 0 ? options.brokerUrls : [...DEFAULT_BROKERS];
    this.clientId = `gitchat_${options.userId || 'anon'}_${Math.random().toString(36).slice(2, 8)}`;
    this.workspaceTopic = deriveWorkspaceTopic(options.owner, options.repo, options.secret);
  }

  public isConnected(): boolean { return this.connected; }
  public getWorkspaceTopic(): string { return this.workspaceTopic; }
  public getCurrentBrokerUrl(): string { return this.brokers[this.currentBrokerIdx]; }

  public rotateBroker(): string {
    this.currentBrokerIdx = (this.currentBrokerIdx + 1) % this.brokers.length;
    return this.getCurrentBrokerUrl();
  }

  public createSyncFilePayload(path: string, content: string) {
    return { type: 'sync_file', path, content, senderId: this.options.userId, timestamp: Date.now() };
  }

  public createSyncRequestPayload() {
    return { type: 'sync_request', requesterId: this.options.userId, timestamp: Date.now() };
  }

  public connect(): void {
    if (typeof WebSocket === 'undefined') return;
    const url = this.getCurrentBrokerUrl();
    if (this.options.onStatusChange) this.options.onStatusChange('connecting');

    try {
      this.ws = new WebSocket(url, ['mqtt']);
      this.ws.binaryType = 'arraybuffer';

      this.ws.onopen = () => {
        const connectPacket = encodeConnectPacket(this.clientId, 60);
        this.ws.send(connectPacket);
      };

      this.ws.onmessage = (event: any) => {
        const buf = new Uint8Array(event.data);
        const packet = parseMqttPacket(buf);

        if (packet.type === 'CONNACK' && packet.returnCode === 0) {
          this.connected = true;
          if (this.options.onStatusChange) this.options.onStatusChange('connected');
          const subPacket = encodeSubscribePacket(this.workspaceTopic, 1);
          this.ws.send(subPacket);
          this.startPing();
          // Request catch-up sync from active peers
          this.publish(this.createSyncRequestPayload());
        } else if (packet.type === 'PUBLISH' && packet.payload) {
          this.handleIncomingPayload(packet.payload);
        }
      };

      this.ws.onerror = () => { this.handleDisconnect(); };
      this.ws.onclose = () => { this.handleDisconnect(); };
    } catch {
      this.handleDisconnect();
    }
  }

  public publish(payload: any): boolean {
    if (!this.connected || !this.ws) return false;
    try {
      const topic = this.workspaceTopic.replace('/#', '/event');
      const packet = encodePublishPacket(topic, JSON.stringify(payload));
      this.ws.send(packet);
      return true;
    } catch {
      return false;
    }
  }

  private handleIncomingPayload(raw: string): void {
    try {
      const data = JSON.parse(raw);
      if (data.senderId === this.options.userId) return; // Ignore self-echo

      if (data.type === 'sync_file' && data.path && data.content && this.options.onFileReceived) {
        this.options.onFileReceived(data.path, data.content);
      } else if (data.type === 'sync_request' && data.requesterId && this.options.onSyncRequested) {
        this.options.onSyncRequested(data.requesterId);
      }
    } catch {}
  }

  private startPing(): void {
    clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => {
      if (this.connected && this.ws) {
        try { this.ws.send(encodePingPacket()); } catch {}
      }
    }, 25000);
  }

  private handleDisconnect(): void {
    clearInterval(this.pingInterval);
    this.connected = false;
    if (this.options.onStatusChange) this.options.onStatusChange('disconnected');
    this.rotateBroker();
  }

  public disconnect(): void {
    clearInterval(this.pingInterval);
    this.connected = false;
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
  }
}
