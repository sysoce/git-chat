import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import {
  shouldNotifyMessage,
  isChannelMuted,
  toggleChannelMute,
  formatNotificationPreview,
  DEFAULT_NOTIFICATION_CONFIG
} from '../src/engine/notificationManager';
import type { ChatMessage, NotificationConfig } from '../src/types/chat';

describe('Notification & Muting Rules Engine Suite', () => {
  const currentUserId = 'user_alice';
  const currentUserName = 'Alice';

  const baseMessage: ChatMessage = {
    id: 'msg_100',
    channelId: 'chan_general',
    author: { id: 'user_bob', name: 'Bob' },
    content: 'Hello team, how is everyone doing?',
    timestamp: Date.now()
  };

  it('suppresses notifications for messages authored by the current user', () => {
    const ownMessage: ChatMessage = {
      ...baseMessage,
      author: { id: currentUserId, name: currentUserName }
    };
    const decision = shouldNotifyMessage(ownMessage, currentUserId, currentUserName, DEFAULT_NOTIFICATION_CONFIG);
    assert.strictEqual(decision.notify, false);
    assert.strictEqual(decision.reason, 'none');
  });

  it('notifies for standard channel messages when global mode is "all" and channel is unmuted', () => {
    const decision = shouldNotifyMessage(baseMessage, currentUserId, currentUserName, DEFAULT_NOTIFICATION_CONFIG);
    assert.strictEqual(decision.notify, true);
    assert.strictEqual(decision.reason, 'all');
  });

  it('suppresses all notifications when globalMode is "nothing" (Do Not Disturb)', () => {
    const config: NotificationConfig = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      globalMode: 'nothing'
    };
    const decision = shouldNotifyMessage(baseMessage, currentUserId, currentUserName, config);
    assert.strictEqual(decision.notify, false);
  });

  it('suppresses standard messages in muted channels', () => {
    const config: NotificationConfig = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      mutedChannelIds: ['chan_general']
    };
    const decision = shouldNotifyMessage(baseMessage, currentUserId, currentUserName, config);
    assert.strictEqual(decision.notify, false);
    assert.strictEqual(decision.reason, 'none');
  });

  it('bypasses channel mute when user is @mentioned and mentionsBypassMute is true', () => {
    const mentionMsg: ChatMessage = {
      ...baseMessage,
      content: 'Hey @Alice, could you review this PR?'
    };
    const config: NotificationConfig = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      mutedChannelIds: ['chan_general'],
      mentionsBypassMute: true
    };
    const decision = shouldNotifyMessage(mentionMsg, currentUserId, currentUserName, config);
    assert.strictEqual(decision.notify, true);
    assert.strictEqual(decision.reason, 'mention');
  });

  it('suppresses mentioned message in muted channel when mentionsBypassMute is false', () => {
    const mentionMsg: ChatMessage = {
      ...baseMessage,
      content: 'Hey @Alice, could you review this PR?'
    };
    const config: NotificationConfig = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      mutedChannelIds: ['chan_general'],
      mentionsBypassMute: false
    };
    const decision = shouldNotifyMessage(mentionMsg, currentUserId, currentUserName, config);
    assert.strictEqual(decision.notify, false);
  });

  it('notifies for direct messages and mentions when globalMode is "mentions"', () => {
    const config: NotificationConfig = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      globalMode: 'mentions'
    };
    // Non-mentioned message in standard channel -> suppressed
    const unmentionedDecision = shouldNotifyMessage(baseMessage, currentUserId, currentUserName, config);
    assert.strictEqual(unmentionedDecision.notify, false);

    // Mentioned message in standard channel -> notified
    const mentionMsg: ChatMessage = {
      ...baseMessage,
      content: 'cc @Alice FYI'
    };
    const mentionDecision = shouldNotifyMessage(mentionMsg, currentUserId, currentUserName, config);
    assert.strictEqual(mentionDecision.notify, true);
    assert.strictEqual(mentionDecision.reason, 'mention');

    // DM channel -> notified
    const dmMsg: ChatMessage = {
      ...baseMessage,
      channelId: 'chan_dm_user_alice__user_bob',
      content: 'Direct confidential message'
    };
    const dmDecision = shouldNotifyMessage(dmMsg, currentUserId, currentUserName, config);
    assert.strictEqual(dmDecision.notify, true);
    assert.strictEqual(dmDecision.reason, 'dm');
  });

  it('isChannelMuted and toggleChannelMute manage muted channel IDs list immutably', () => {
    const initialConfig: NotificationConfig = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      mutedChannelIds: ['chan_random']
    };

    assert.strictEqual(isChannelMuted('chan_random', initialConfig), true);
    assert.strictEqual(isChannelMuted('chan_general', initialConfig), false);

    // Muting chan_general
    const mutedGeneral = toggleChannelMute('chan_general', initialConfig);
    assert.deepStrictEqual(mutedGeneral.mutedChannelIds, ['chan_random', 'chan_general']);
    assert.strictEqual(isChannelMuted('chan_general', mutedGeneral), true);

    // Unmuting chan_random
    const unmutedRandom = toggleChannelMute('chan_random', mutedGeneral);
    assert.deepStrictEqual(unmutedRandom.mutedChannelIds, ['chan_general']);
    assert.strictEqual(isChannelMuted('chan_random', unmutedRandom), false);
  });

  it('formatNotificationPreview generates clean titles and truncated snippets', () => {
    const preview = formatNotificationPreview(baseMessage, 'general');
    assert.strictEqual(preview.title, '#general • Bob');
    assert.strictEqual(preview.body, 'Hello team, how is everyone doing?');

    const dmPreview = formatNotificationPreview({
      ...baseMessage,
      channelId: 'chan_dm_user_alice__user_bob'
    }, 'Bob');
    assert.strictEqual(dmPreview.title, 'Bob (Direct Message)');
  });
});
