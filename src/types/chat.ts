export interface ChatAuthor {
  id: string;
  name: string;
  avatar?: string;
  isBot?: boolean;
}

export interface ChatAttachment {
  name: string;
  type: string;
  url?: string;
  size?: number;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  threadRootId?: string;
  author: ChatAuthor;
  content: string;
  attachments?: ChatAttachment[];
  reactions?: Record<string, string[]>; // emoji -> userIds
  replyCount?: number;
  lastReplyAt?: number;
  editedAt?: number;
  deletedAt?: number;
  timestamp: number;
}

export interface ChatChannel {
  id: string;
  name: string;
  topic?: string;
  description?: string;
  isPrivate?: boolean;
  isDm?: boolean;
  members?: string[];
  createdAt?: number;
  createdBy?: string;
}

export interface ChatUser {
  id: string;
  name: string;
  avatar?: string;
  email?: string;
  role?: 'admin' | 'member' | 'agent';
  pubkey?: string;
  isBot?: boolean;
}

export interface ChatPresence {
  userId: string;
  status: 'online' | 'active' | 'busy' | 'away' | 'offline' | 'running';
  emoji?: string;
  text?: string;
  currentTask?: string;
  huddleId?: string | null;
  lastSeen: number;
}

export type ChatEventType = 'reaction_add' | 'reaction_remove' | 'message_edit' | 'message_delete' | 'presence_update';

export interface ChatEvent {
  id: string;
  type: ChatEventType;
  channelId: string;
  authorId: string;
  targetMessageId?: string;
  emoji?: string;
  payload?: any;
  timestamp: number;
}

export interface ChatWorkspaceConfig {
  name: string;
  description?: string;
  defaultChannelId: string;
  channels: ChatChannel[];
  createdAt: number;
  version: string;
}

export interface ChatManifestChannelSummary {
  id: string;
  name: string;
  messageCount: number;
  lastMessageAt: number;
  lastMessageSnippet?: string;
  lastAuthorName?: string;
}

export interface ChatManifest {
  version: string;
  workspaceName: string;
  generatedAt: number;
  channels: Record<string, ChatManifestChannelSummary>;
  activeUsersCount: number;
  totalMessagesCount: number;
}
