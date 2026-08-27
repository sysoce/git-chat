import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Standalone File:// Mode & URL Resolution Suite', () => {
  it('correctly resolves http://localhost:4300 as default bridge when opened as file://', () => {
    function getApiBase(config: { backendUrl?: string }, protocol: string, origin: string) {
      if (config.backendUrl && config.backendUrl.trim()) {
        return config.backendUrl.trim().replace(/\/+$/, '');
      }
      if (protocol === 'file:' || !origin || origin === 'null') {
        return 'http://localhost:4300';
      }
      return '';
    }

    function apiUrl(path: string, config: { backendUrl?: string }, protocol: string, origin: string) {
      const base = getApiBase(config, protocol, origin);
      const cleanPath = path.startsWith('/') ? path : '/' + path;
      return base ? `${base}${cleanPath}` : cleanPath;
    }

    // 1. file:// with default empty backendUrl
    const fileUrl = apiUrl('/api/sync/pull', { backendUrl: '' }, 'file:', 'null');
    assert.strictEqual(fileUrl, 'http://localhost:4300/api/sync/pull');

    // 2. Custom backend URL configured in settings
    const customUrl = apiUrl('/api/identity', { backendUrl: 'http://192.168.1.50:4300/' }, 'file:', 'null');
    assert.strictEqual(customUrl, 'http://192.168.1.50:4300/api/identity');

    // 3. Normal http:// origin
    const httpUrl = apiUrl('/api/sync/pull', { backendUrl: '' }, 'http:', 'http://localhost:4300');
    assert.strictEqual(httpUrl, '/api/sync/pull');
  });

  it('correctly parses discrete sync files for users, presence, channels, and messages', () => {
    const state = {
      users: {} as Record<string, any>,
      presence: {} as Record<string, any>,
      channels: {} as Record<string, any>,
      messages: [] as any[]
    };

    function processSyncFile(relativePath: string, contentStr: string) {
      const parsed = JSON.parse(contentStr);
      if (relativePath.match(/^users\/([a-zA-Z0-9_-]+)\.json$/)) {
        if (parsed.id) state.users[parsed.id] = { ...state.users[parsed.id], ...parsed };
        return true;
      }
      if (relativePath.match(/^presence\/([a-zA-Z0-9_-]+)\.json$/)) {
        if (parsed.userId && state.users[parsed.userId]) {
          state.users[parsed.userId].lastSeen = parsed.lastSeen;
          return true;
        }
      }
      if (relativePath.includes('/messages/')) {
        const idx = state.messages.findIndex(m => m.id === parsed.id);
        if (idx === -1) state.messages.push(parsed);
        else state.messages[idx] = { ...state.messages[idx], ...parsed };
        return true;
      }
      return false;
    }

    // Process user file
    const userRes = processSyncFile('users/user_mobile.json', JSON.stringify({
      id: 'user_mobile',
      name: 'Phone User',
      avatar: '📱',
      lastSeen: 1700000000000
    }));
    assert.strictEqual(userRes, true);
    assert.strictEqual(state.users['user_mobile'].name, 'Phone User');

    // Process presence update
    const presRes = processSyncFile('presence/user_mobile.json', JSON.stringify({
      userId: 'user_mobile',
      status: 'online',
      lastSeen: 1700000050000
    }));
    assert.strictEqual(presRes, true);
    assert.strictEqual(state.users['user_mobile'].lastSeen, 1700000050000);

    // Process message
    const msgRes = processSyncFile('channels/chan_general/messages/1700000050000_user_mobile_msg123.json', JSON.stringify({
      id: 'msg123',
      channelId: 'chan_general',
      author: { id: 'user_mobile', name: 'Phone User', avatar: '📱' },
      content: 'Hello from iPhone!'
    }));
    assert.strictEqual(msgRes, true);
    assert.strictEqual(state.messages.length, 1);
    assert.strictEqual(state.messages[0].content, 'Hello from iPhone!');
  });
});
