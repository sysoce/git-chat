import type { ChatMessage, ChatEvent, ChatPresence, ChatUser, ChatChannel } from '../types/chat';

export interface ProjectedChannelData {
  channel: ChatChannel;
  messages: ChatMessage[];
  threads: Record<string, ChatMessage[]>; // threadRootId -> replies
  unreadCount?: number;
}

export interface ProjectedChatState {
  channels: Record<string, ProjectedChannelData>;
  users: Record<string, ChatUser>;
  presence: Record<string, ChatPresence>;
  lastProjectedTimestamp: number;
}

export class ChatEventProjector {
  private messagesMap = new Map<string, ChatMessage>(); // msgId -> message
  private eventsList: ChatEvent[] = [];
  private usersMap = new Map<string, ChatUser>();
  private presenceMap = new Map<string, ChatPresence>();
  private channelsMap = new Map<string, ChatChannel>();

  public addChannel(channel: ChatChannel): void {
    this.channelsMap.set(channel.id, channel);
  }

  public addUser(user: ChatUser): void {
    this.usersMap.set(user.id, user);
  }

  public updatePresence(presence: ChatPresence): void {
    const existing = this.presenceMap.get(presence.userId);
    if (!existing || presence.lastSeen >= existing.lastSeen) {
      this.presenceMap.set(presence.userId, presence);
    }
  }

  public ingestMessage(message: ChatMessage): void {
    const existing = this.messagesMap.get(message.id);
    if (!existing) {
      this.messagesMap.set(message.id, {
        ...message,
        reactions: message.reactions || {},
        replyCount: 0,
      });
    } else {
      // Merge properties if newer
      this.messagesMap.set(message.id, {
        ...existing,
        ...message,
        reactions: { ...existing.reactions, ...message.reactions },
      });
    }
  }

  public ingestEvent(event: ChatEvent): void {
    this.eventsList.push(event);
  }

  /**
   * Projects the entire discrete state into high-speed UI-ready channels, timelines, and threads.
   */
  public project(): ProjectedChatState {
    // 1. Sort events chronologically
    const sortedEvents = [...this.eventsList].sort((a, b) => a.timestamp - b.timestamp);

    // 2. Clone messages map to mutate during event fold
    const projectedMessages = new Map<string, ChatMessage>();
    for (const [id, msg] of this.messagesMap.entries()) {
      projectedMessages.set(id, {
        ...msg,
        reactions: { ...(msg.reactions || {}) },
      });
    }

    // 3. Fold events over messages
    for (const ev of sortedEvents) {
      if (!ev.targetMessageId) continue;
      const target = projectedMessages.get(ev.targetMessageId);
      if (!target) continue;

      if (ev.type === 'reaction_add' && ev.emoji) {
        target.reactions = target.reactions || {};
        const userList = target.reactions[ev.emoji] || [];
        if (!userList.includes(ev.authorId)) {
          target.reactions[ev.emoji] = [...userList, ev.authorId];
        }
      } else if (ev.type === 'reaction_remove' && ev.emoji) {
        if (target.reactions && target.reactions[ev.emoji]) {
          target.reactions[ev.emoji] = target.reactions[ev.emoji]!.filter((uid) => uid !== ev.authorId);
          if (target.reactions[ev.emoji]!.length === 0) {
            delete target.reactions[ev.emoji];
          }
        }
      } else if (ev.type === 'message_edit' && ev.payload?.content) {
        target.content = ev.payload.content;
        target.editedAt = ev.timestamp;
      } else if (ev.type === 'message_delete') {
        target.deletedAt = ev.timestamp;
        target.content = '_This message was deleted_';
      }
    }

    // 4. Separate root messages and thread replies
    const channelsData: Record<string, ProjectedChannelData> = {};

    // Initialize all known channels
    for (const [chanId, channel] of this.channelsMap.entries()) {
      channelsData[chanId] = {
        channel,
        messages: [],
        threads: {},
      };
    }

    const allMsgs = Array.from(projectedMessages.values()).sort((a, b) => a.timestamp - b.timestamp);

    // First pass: group thread replies
    for (const msg of allMsgs) {
      if (msg.threadRootId) {
        const root = projectedMessages.get(msg.threadRootId);
        if (root) {
          root.replyCount = (root.replyCount || 0) + 1;
          root.lastReplyAt = Math.max(root.lastReplyAt || 0, msg.timestamp);
        }
      }
    }

    // Second pass: distribute to channel data
    for (const msg of allMsgs) {
      let chan = channelsData[msg.channelId];
      if (!chan) {
        chan = {
          channel: { id: msg.channelId, name: msg.channelId.replace(/^chan_/, '') },
          messages: [],
          threads: {},
        };
        channelsData[msg.channelId] = chan;
      }

      if (msg.threadRootId) {
        if (!chan.threads[msg.threadRootId]) {
          chan.threads[msg.threadRootId] = [];
        }
        chan.threads[msg.threadRootId]!.push(msg);
      } else {
        chan.messages.push(msg);
      }
    }

    return {
      channels: channelsData,
      users: Object.fromEntries(this.usersMap.entries()),
      presence: Object.fromEntries(this.presenceMap.entries()),
      lastProjectedTimestamp: Date.now(),
    };
  }

  /**
   * Search messages across all channels matching query.
   */
  public searchMessages(query: string): ChatMessage[] {
    const q = (query || '').toLowerCase().trim();
    if (!q) return [];
    return Array.from(this.messagesMap.values())
      .filter((m) => !m.deletedAt && m.content.toLowerCase().includes(q))
      .sort((a, b) => b.timestamp - a.timestamp);
  }
}
