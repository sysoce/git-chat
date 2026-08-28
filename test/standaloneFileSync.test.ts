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

    function resolveAttachmentUrl(att: { url?: string; key?: string }, config: { backendUrl?: string }, protocol: string, origin: string) {
      if (!att) return '';
      const raw = att.url || (att.key ? `/api/s3/file/${att.key}` : '');
      if (!raw) return '';
      if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:') || raw.startsWith('blob:')) {
        return raw;
      }
      return apiUrl(raw, config, protocol, origin);
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

    // 4. Attachment with /api/s3/file path in file:// mode prefixes localhost:4300
    const localS3AttUrl = resolveAttachmentUrl(
      { url: '/api/s3/file/attachments/1787911682022_screenshot.png' },
      { backendUrl: '' },
      'file:',
      'null'
    );
    assert.strictEqual(localS3AttUrl, 'http://localhost:4300/api/s3/file/attachments/1787911682022_screenshot.png');

    // 5. Attachment with remote GitHub raw URL is preserved as-is
    const rawGhAttUrl = resolveAttachmentUrl(
      { url: 'https://raw.githubusercontent.com/alice/git-chat-media/main/attachments/photo.png' },
      { backendUrl: '' },
      'file:',
      'null'
    );
    assert.strictEqual(rawGhAttUrl, 'https://raw.githubusercontent.com/alice/git-chat-media/main/attachments/photo.png');

    // 6. Attachment with inline data: URI is preserved as-is
    const dataAttUrl = resolveAttachmentUrl(
      { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
      { backendUrl: '' },
      'file:',
      'null'
    );
    assert.strictEqual(dataAttUrl.startsWith('data:image/png;base64,'), true);

    // 7. Attachment with only key in file:// mode resolves to full API url
    const keyOnlyAttUrl = resolveAttachmentUrl(
      { key: 'attachments/voice.wav' },
      { backendUrl: '' },
      'file:',
      'null'
    );
    assert.strictEqual(keyOnlyAttUrl, 'http://localhost:4300/api/s3/file/attachments/voice.wav');
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

  it('correctly classifies media MIME types and extensions for the built-in media viewer', () => {
    function isImageMimeOrExt(mime: string, name: string) {
      const m = (mime || '').toLowerCase();
      const n = (name || '').toLowerCase();
      return m.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(n);
    }

    function getMediaKind(mime: string, name: string): 'image' | 'video' | 'audio' | 'file' {
      if (isImageMimeOrExt(mime, name)) return 'image';
      const m = (mime || '').toLowerCase();
      const n = (name || '').toLowerCase();
      if (m.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(n)) return 'video';
      if (m.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac)$/i.test(n)) return 'audio';
      return 'file';
    }

    assert.strictEqual(getMediaKind('image/png', 'photo.png'), 'image');
    assert.strictEqual(getMediaKind('', 'Screenshot.JPEG'), 'image');
    assert.strictEqual(getMediaKind('video/mp4', 'recording.mp4'), 'video');
    assert.strictEqual(getMediaKind('', 'clip.mov'), 'video');
    assert.strictEqual(getMediaKind('audio/mpeg', 'voice.mp3'), 'audio');
    assert.strictEqual(getMediaKind('application/pdf', 'doc.pdf'), 'file');
  });
});

