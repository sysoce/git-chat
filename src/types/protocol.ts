import type { ChatMessage, ChatEvent, ChatPresence, ChatUser, ChatWorkspaceConfig } from './chat';

export interface GitRemoteInfo {
  owner: string;
  repo: string;
}

export interface GitChatConfig {
  remoteUrl: string;
  owner?: string;
  repo?: string;
  dataBranch: string; // default "git-chat"
  token?: string;
  user: ChatUser;
  pollIntervalMs?: number;
}

export interface SyncPushPayload {
  messages?: ChatMessage[];
  events?: ChatEvent[];
  presence?: ChatPresence;
  user?: ChatUser;
}

export interface SyncPullResult {
  etag?: string;
  isModified: boolean;
  messages: ChatMessage[];
  events: ChatEvent[];
  presence: Record<string, ChatPresence>;
  users: Record<string, ChatUser>;
  config?: ChatWorkspaceConfig;
  lastSyncTimestamp: number;
}
