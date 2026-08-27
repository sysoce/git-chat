import type { ChatManifest, ChatManifestChannelSummary } from '../types/chat';
import type { ProjectedChatState } from './chatEventProjector';

export class ChatManifestGenerator {
  public static generateManifest(
    workspaceName: string,
    state: ProjectedChatState
  ): ChatManifest {
    const channelSummaries: Record<string, ChatManifestChannelSummary> = {};
    let totalMessages = 0;

    for (const [chanId, data] of Object.entries(state.channels)) {
      const msgs = data.messages;
      const count = msgs.length;
      totalMessages += count;

      const lastMsg = msgs[msgs.length - 1];
      channelSummaries[chanId] = {
        id: chanId,
        name: data.channel.name,
        messageCount: count,
        lastMessageAt: lastMsg ? lastMsg.timestamp : 0,
        lastMessageSnippet: lastMsg ? lastMsg.content.slice(0, 80) : undefined,
        lastAuthorName: lastMsg ? lastMsg.author.name : undefined,
      };
    }

    const activeUsersCount = Object.values(state.presence).filter(
      (p) => Date.now() - p.lastSeen < 1000 * 60 * 15 // Active in last 15m
    ).length;

    return {
      version: '1.0.0',
      workspaceName,
      generatedAt: Date.now(),
      channels: channelSummaries,
      activeUsersCount: Math.max(activeUsersCount, Object.keys(state.users).length > 0 ? 1 : 0),
      totalMessagesCount: totalMessages,
    };
  }
}
