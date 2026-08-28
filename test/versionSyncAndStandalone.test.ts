import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { CLIENT_VERSION } from '../src/engine/version';
import { getDmChannelId, parseDmChannelUsers } from '../src/types/chat';

describe('Version Synchronization & Standalone HTML Integrity', () => {
  const rootDir = path.resolve(__dirname, '..');
  const pkgJsonPath = path.join(rootDir, 'package.json');
  const indexHtmlPath = path.join(rootDir, 'index.html');

  it('keeps CLIENT_VERSION in sync with package.json version', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    assert.strictEqual(CLIENT_VERSION, pkg.version, 'CLIENT_VERSION must match package.json version');
  });

  it('keeps index.html CLIENT_VERSION constant in sync with package.json', () => {
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const match = indexHtml.match(/const CLIENT_VERSION\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(match, 'index.html must define CLIENT_VERSION');
    assert.strictEqual(match[1], CLIENT_VERSION, 'index.html version must match CLIENT_VERSION');
  });

  it('generates and parses DM channel IDs correctly in both TypeScript and standalone HTML', () => {
    // Domain helpers
    const dmId1 = getDmChannelId('user_alice', 'user_bob');
    const dmId2 = getDmChannelId('user_bob', 'user_alice');
    assert.strictEqual(dmId1, 'chan_dm_user_alice__user_bob');
    assert.strictEqual(dmId2, 'chan_dm_user_alice__user_bob');

    const participants = parseDmChannelUsers(dmId1);
    assert.deepStrictEqual(participants, ['user_alice', 'user_bob']);

    assert.strictEqual(parseDmChannelUsers('chan_general'), null);
    assert.strictEqual(parseDmChannelUsers('invalid'), null);
  });

  it('guarantees getDmChannelId and parseDmChannelUsers are defined in standalone index.html', () => {
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    assert.ok(indexHtml.includes('function getDmChannelId('), 'index.html must define getDmChannelId');
    assert.ok(indexHtml.includes('function parseDmChannelUsers('), 'index.html must define parseDmChannelUsers');
    assert.ok(indexHtml.includes('window.getDmChannelId = getDmChannelId;'), 'getDmChannelId must be exposed to window');
  });

  it('guarantees notification functions, state, and UI tabs are fully defined in standalone index.html', () => {
    const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    
    // Core notification state & persistence
    assert.ok(indexHtml.includes('const DEFAULT_NOTIFICATION_CONFIG ='), 'index.html must define DEFAULT_NOTIFICATION_CONFIG');
    assert.ok(indexHtml.includes('let notificationConfig ='), 'index.html must declare notificationConfig');
    assert.ok(indexHtml.includes('const notifiedMessageIds = new Set()'), 'index.html must declare notifiedMessageIds Set');
    assert.ok(indexHtml.includes('function loadNotificationConfig('), 'index.html must define loadNotificationConfig');
    assert.ok(indexHtml.includes('function saveNotificationConfig('), 'index.html must define saveNotificationConfig');
    
    // Notification filtering, formatting & audio
    assert.ok(indexHtml.includes('function isMentioned('), 'index.html must define isMentioned');
    assert.ok(indexHtml.includes('function isChannelMuted('), 'index.html must define isChannelMuted');
    assert.ok(indexHtml.includes('function toggleChannelMute('), 'index.html must define toggleChannelMute');
    assert.ok(indexHtml.includes('function shouldNotifyMessage('), 'index.html must define shouldNotifyMessage');
    assert.ok(indexHtml.includes('function formatNotificationPreview('), 'index.html must define formatNotificationPreview');
    assert.ok(indexHtml.includes('function playNotificationSound('), 'index.html must define playNotificationSound');
    assert.ok(indexHtml.includes('function sendPushNotification('), 'index.html must define sendPushNotification');
    assert.ok(indexHtml.includes('function notifyMessageIfEligible('), 'index.html must define notifyMessageIfEligible');

    // UI actions and settings modal tab
    assert.ok(indexHtml.includes('function toggleCurrentChannelMute('), 'index.html must define toggleCurrentChannelMute');
    assert.ok(indexHtml.includes('function updateChannelMuteUI('), 'index.html must define updateChannelMuteUI');
    assert.ok(indexHtml.includes('function requestNotificationPermission('), 'index.html must define requestNotificationPermission');
    assert.ok(indexHtml.includes('function sendTestNotification('), 'index.html must define sendTestNotification');
    assert.ok(indexHtml.includes('function renderNotificationsSettingsTab('), 'index.html must define renderNotificationsSettingsTab');
    assert.ok(indexHtml.includes('window.unmuteSpecificChannel ='), 'index.html must expose window.unmuteSpecificChannel');
    assert.ok(indexHtml.includes('id="stab-notifications"'), 'index.html must have notifications tab button');
    assert.ok(indexHtml.includes('id="sec-notifications"'), 'index.html must have notifications settings section');
  });
});

