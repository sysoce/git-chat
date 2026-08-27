import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert';
import * as http from 'node:http';
import { S3Client } from '../src/storage/s3Client';
import { startGitChatServer } from '../src/server/server';
import * as path from 'node:path';

describe('S3 Storage & Media Integration Suite', () => {
  const client = new S3Client({
    endpoint: 'http://127.0.0.1:9000',
    bucket: 'git-chat-media',
    accessKey: 'minioadmin',
    secretKey: 'minioadminpassword'
  });

  it('checks S3 server health status', async () => {
    const health = await client.checkHealth();
    assert.strictEqual(health.online, true, 'MinIO S3 server should be online');
    assert.strictEqual(health.bucket, 'git-chat-media');
  });

  it('uploads an image buffer to S3 and verifies returned metadata', async () => {
    const sampleImageBuffer = Buffer.from('GIF89a\x01\x00\x01\x00\x80\x00\x00\xff\xff\xff\x00\x00\x00!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;');
    const result = await client.uploadObject('test-avatar.gif', 'image/gif', sampleImageBuffer);

    assert.strictEqual(result.name, 'test-avatar.gif');
    assert.strictEqual(result.type, 'image/gif');
    assert.strictEqual(result.size, sampleImageBuffer.length);
    assert.match(result.key, /^attachments\/.+\.gif$/);
    assert.match(result.url, /^\/api\/s3\/file\/attachments\/.+\.gif$/);

    // Retrieve and verify data
    const fetched = await client.getObject(result.key);
    assert.strictEqual(fetched.contentType, 'image/gif');
    assert.strictEqual(fetched.data.equals(sampleImageBuffer), true);
  });

  it('uploads a document file to S3 and retrieves it', async () => {
    const textData = Buffer.from('# Architecture Document\nMinIO local S3 storage for git-chat.', 'utf8');
    const result = await client.uploadObject('architecture.md', 'text/markdown', textData);

    assert.strictEqual(result.name, 'architecture.md');
    assert.strictEqual(result.type, 'text/markdown');

    const fetched = await client.getObject(result.key);
    assert.strictEqual(fetched.contentType, 'text/markdown');
    assert.strictEqual(fetched.data.toString('utf8'), textData.toString('utf8'));
  });

  describe('Git-Chat HTTP Server S3 Endpoints', () => {
    let server: http.Server;
    const testPort = 4455;
    const rootDir = path.resolve(__dirname, '..');

    before(async () => {
      server = startGitChatServer({
        port: testPort,
        host: '127.0.0.1',
        workspaceRoot: rootDir,
      });
      await new Promise(r => setTimeout(r, 100));
    });

    after(async () => {
      if (server) {
        (server as any).closeAllConnections?.();
        server.unref();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it('GET /api/s3/status returns online status', async () => {
      const res = await fetch(`http://127.0.0.1:${testPort}/api/s3/status`, {
        headers: { 'Connection': 'close' }
      });
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.online, true);
      assert.strictEqual(data.bucket, 'git-chat-media');
    });

    it('POST /api/s3/upload uploads base64 data and GET /api/s3/file/:key serves it', async () => {
      const payloadContent = 'Audio speech sample data 12345';
      const base64Data = Buffer.from(payloadContent).toString('base64');

      const uploadRes = await fetch(`http://127.0.0.1:${testPort}/api/s3/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Connection': 'close' },
        body: JSON.stringify({
          filename: 'voice-memo.wav',
          mimeType: 'audio/wav',
          data: base64Data
        })
      });

      assert.strictEqual(uploadRes.status, 200);
      const uploadJson = await uploadRes.json();
      assert.strictEqual(uploadJson.success, true);
      assert.strictEqual(uploadJson.attachment.name, 'voice-memo.wav');
      assert.strictEqual(uploadJson.attachment.type, 'audio/wav');

      // Fetch file from server
      const fileRes = await fetch(`http://127.0.0.1:${testPort}${uploadJson.attachment.url}`, {
        headers: { 'Connection': 'close' }
      });
      assert.strictEqual(fileRes.status, 200);
      assert.strictEqual(fileRes.headers.get('content-type'), 'audio/wav');
      const text = await fileRes.text();
      assert.strictEqual(text, payloadContent);
    });
  });
});
