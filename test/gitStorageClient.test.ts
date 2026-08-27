import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GitStorageClient } from '../src/storage/gitStorageClient';
import { deriveVaultKey } from '../src/security/cryptoVault';

describe('GitStorageClient & Decentralized Auto-Volume Suite', () => {
  it('generates correct volume repository names for users and increments', () => {
    assert.strictEqual(GitStorageClient.getVolumeRepoName('alice', 1), 'alice/git-chat-media');
    assert.strictEqual(GitStorageClient.getVolumeRepoName('alice', 2), 'alice/git-chat-media-vol2');
    assert.strictEqual(GitStorageClient.getVolumeRepoName('bob_kth', 3), 'bob_kth/git-chat-media-vol3');
    assert.strictEqual(GitStorageClient.getVolumeRepoName('User With Spaces!', 1), 'User_With_Spaces_/git-chat-media');
  });

  it('generates accurate raw CDN URLs for GitHub and KTH Gita', () => {
    const githubClient = new GitStorageClient({
      provider: 'github',
      owner: 'alice',
      repo: 'alice/git-chat-media',
      branch: 'main',
    });
    const ghUrl = githubClient.getRawUrl('alice/git-chat-media', 'main', 'attachments/image.png');
    assert.strictEqual(ghUrl, 'https://raw.githubusercontent.com/alice/git-chat-media/main/attachments/image.png');

    const gitaClient = new GitStorageClient({
      provider: 'gita',
      owner: 'sysoce',
      repo: 'sysoce/git-chat-media',
      branch: 'main',
      baseUrl: 'https://gita.sys.kth.se',
    });
    const gitaUrl = gitaClient.getRawUrl('sysoce/git-chat-media', 'main', 'attachments/video.mp4');
    assert.strictEqual(gitaUrl, 'https://gita.sys.kth.se/sysoce/git-chat-media/-/raw/main/attachments/video.mp4');
  });

  it('falls back to inline encrypted Data URI when token is absent and file < 2MB', async () => {
    const client = new GitStorageClient({
      provider: 'github',
      owner: 'alice',
      allowInlineFallback: true,
    });

    const sampleBytes = new TextEncoder().encode('Hello Git Storage Image Sample');
    const attachment = await client.uploadFile(sampleBytes, 'test_image.png', 'image/png', {
      authorId: 'user_alice',
    });

    assert.strictEqual(attachment.name, 'test_image.png');
    assert.strictEqual(attachment.type, 'image/png');
    assert.strictEqual(attachment.size, sampleBytes.length);
    assert.ok(attachment.url?.startsWith('data:image/png;base64,'));
  });

  it('encrypts binary attachment with AES-GCM-256 before upload fallback', async () => {
    const client = new GitStorageClient({
      provider: 'github',
      owner: 'bob',
      allowInlineFallback: true,
    });

    const key = await deriveVaultKey('SecretPassword123!', 'git-chat-test-salt');
    const secretImageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01, 0x02]);

    const attachment = await client.uploadFile(secretImageBytes, 'private_diagram.png', 'image/png', {
      authorId: 'user_bob',
      encrypt: true,
      key,
    });

    assert.ok(attachment.url?.startsWith('data:image/png;base64,'));
  });

  it('increments and tracks volume rollover smoothly', () => {
    const client = new GitStorageClient({
      provider: 'github',
      owner: 'alice',
    });

    const vol2 = client.rolloverVolume();
    assert.strictEqual(vol2, 'alice/git-chat-media-vol2');

    const vol3 = client.rolloverVolume();
    assert.strictEqual(vol3, 'alice/git-chat-media-vol3');
  });
});
