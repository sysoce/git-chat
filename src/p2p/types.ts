export type P2PSignalType = 'offer' | 'answer' | 'candidate' | 'discovery' | 'bye' | 'ping' | 'pong';

export interface P2PIceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface P2PSignalMessage {
  type: P2PSignalType;
  senderId: string;
  recipientId?: string;
  sdp?: any;
  candidate?: P2PIceCandidate | any;
  timestamp: number;
}

export type P2PConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'closed';

export interface P2PDataMessage {
  type: string;
  path?: string;
  content?: string;
  payload?: any;
  timestamp: number;
  senderId: string;
}

export interface P2PConnectionOptions {
  peerId: string;
  remotePeerId?: string;
  isInitiator?: boolean;
  iceServers?: RTCIceServer[];
  onDataMessage?: (msg: P2PDataMessage) => void;
  onStateChange?: (state: P2PConnectionState) => void;
  onSignal?: (signal: P2PSignalMessage) => void;
}
