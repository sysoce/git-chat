export type TransportStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'failed'
  | 'offline';

export interface TransportMessage {
  id: string;
  type: string;
  channelId?: string;
  path?: string;
  content?: string;
  payload?: any;
  timestamp: number;
  senderId?: string;
  recipientId?: string;
}

export interface TransportAdapter {
  readonly mode: string;
  readonly priority: number;
  readonly name: string;
  getStatus(): TransportStatus;
  connect(): Promise<boolean>;
  disconnect(): void;
  send(message: TransportMessage): Promise<boolean>;
  onMessage(listener: (msg: TransportMessage) => void): () => void;
  onStatusChange(listener: (status: TransportStatus) => void): () => void;
}
