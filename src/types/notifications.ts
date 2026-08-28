export type NotificationMode = 'all' | 'mentions' | 'nothing';

export interface NotificationConfig {
  enabled: boolean;
  soundEnabled: boolean;
  globalMode: NotificationMode;
  mentionsBypassMute: boolean;
  mutedChannelIds: string[];
  mutedUserIds?: string[];
}

export interface NotificationDecision {
  notify: boolean;
  reason: 'all' | 'mention' | 'dm' | 'none';
  sound: boolean;
}

export interface NotificationPreview {
  title: string;
  body: string;
  channelId: string;
  messageId: string;
  threadRootId?: string;
  avatar?: string;
}
