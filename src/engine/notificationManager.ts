import type { ChatMessage } from '../types/chat';
import type {
  NotificationConfig,
  NotificationDecision,
  NotificationPreview
} from '../types/notifications';
import { parseDmChannelUsers } from '../types/chat';

export const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  enabled: false,
  soundEnabled: true,
  globalMode: 'all',
  mentionsBypassMute: true,
  mutedChannelIds: [],
  mutedUserIds: []
};

export function isMentioned(content: string, currentUserId: string, currentUserName: string): boolean {
  if (!content) return false;
  const lower = content.toLowerCase();
  const nameRegex = new RegExp(`@${currentUserName.toLowerCase()}\\b`, 'i');
  const idRegex = new RegExp(`@${currentUserId.toLowerCase()}\\b`, 'i');

  if (nameRegex.test(lower) || idRegex.test(lower)) return true;
  if (/\b@(everyone|channel|here)\b/i.test(lower)) return true;
  if (currentUserId === 'user_human_agent' && (/\b@human\b/i.test(lower) || /\/human\b/i.test(lower))) {
    return true;
  }
  return false;
}

export function isChannelMuted(channelId: string, config: NotificationConfig): boolean {
  return Boolean(config.mutedChannelIds?.includes(channelId));
}

export function toggleChannelMute(channelId: string, config: NotificationConfig): NotificationConfig {
  const currentList = config.mutedChannelIds || [];
  const nextList = currentList.includes(channelId)
    ? currentList.filter(id => id !== channelId)
    : [...currentList, channelId];

  return {
    ...config,
    mutedChannelIds: nextList
  };
}

export function shouldNotifyMessage(
  msg: ChatMessage,
  currentUserId: string,
  currentUserName: string,
  config: NotificationConfig
): NotificationDecision {
  if (!msg || msg.author.id === currentUserId) {
    return { notify: false, reason: 'none', sound: false };
  }

  if (config.globalMode === 'nothing') {
    return { notify: false, reason: 'none', sound: false };
  }

  if (config.mutedUserIds?.includes(msg.author.id)) {
    return { notify: false, reason: 'none', sound: false };
  }

  const mentioned = isMentioned(msg.content, currentUserId, currentUserName);
  const dmUsers = parseDmChannelUsers(msg.channelId);
  const isDm = Boolean(dmUsers && dmUsers.includes(currentUserId));
  const channelMuted = isChannelMuted(msg.channelId, config);

  if (channelMuted) {
    if (mentioned && config.mentionsBypassMute) {
      return { notify: true, reason: 'mention', sound: config.soundEnabled };
    }
    return { notify: false, reason: 'none', sound: false };
  }

  if (config.globalMode === 'mentions') {
    if (mentioned) {
      return { notify: true, reason: 'mention', sound: config.soundEnabled };
    }
    if (isDm) {
      return { notify: true, reason: 'dm', sound: config.soundEnabled };
    }
    return { notify: false, reason: 'none', sound: false };
  }

  // globalMode === 'all'
  return {
    notify: true,
    reason: mentioned ? 'mention' : isDm ? 'dm' : 'all',
    sound: config.soundEnabled
  };
}

export function formatNotificationPreview(msg: ChatMessage, channelName?: string): NotificationPreview {
  const isDm = msg.channelId.startsWith('chan_dm_');
  const cleanName = channelName ? channelName.replace(/^#/, '') : msg.channelId;
  const title = isDm ? `${msg.author.name} (Direct Message)` : `#${cleanName} • ${msg.author.name}`;

  let body = (msg.content || '').replace(/\s+/g, ' ').trim();
  if (!body && msg.attachments && msg.attachments.length > 0) {
    body = `[Attachment: ${msg.attachments[0].name}]`;
  }
  if (body.length > 150) {
    body = body.slice(0, 147) + '...';
  }

  return {
    title,
    body,
    channelId: msg.channelId,
    messageId: msg.id,
    threadRootId: msg.threadRootId,
    avatar: msg.author.avatar
  };
}
