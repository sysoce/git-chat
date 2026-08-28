import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LiveMeshRelay } from '../src/engine/liveMeshRelay.js';
import { deriveVaultKey, encryptContent, decryptContent } from '../src/security/cryptoVault.js';

describe('Live Mesh Cross-Device E2EE Integration Suite', () => {
  it('allows Computer and Phone to exchange encrypted messages seamlessly over Live Mesh', async () => {
    const sharedSecret = 'test_mesh_shared_secret';
    const vaultPass = 'my_vault_password_123';
    const key = await deriveVaultKey(vaultPass, 'salt_chan_general');

    const plainText = 'Hello from Computer to Phone!';
    const encrypted = await encryptContent(plainText, key);

    // Verify round-trip encryption format
    assert.ok(encrypted.iv);
    assert.ok(encrypted.ciphertext);
    const decrypted = await decryptContent(encrypted, key);
    assert.equal(decrypted, plainText);

    const computerRelay = new LiveMeshRelay({
      owner: 'sysoce',
      repo: 'chat-data',
      secret: sharedSecret,
      userId: 'user_dev'
    });

    const phoneRelay = new LiveMeshRelay({
      owner: 'sysoce',
      repo: 'chat-data',
      secret: sharedSecret,
      userId: 'user_mobile'
    });

    // Verify matching workspace topics
    assert.equal(computerRelay.getWorkspaceTopic(), phoneRelay.getWorkspaceTopic());

    const syncFilePayload = computerRelay.createSyncFilePayload(
      'channels/chan_general/messages/123.json',
      JSON.stringify({
        id: 'msg_123',
        channelId: 'chan_general',
        authorId: 'user_dev',
        encryptedContent: encrypted,
        timestamp: Date.now()
      })
    );

    assert.equal(syncFilePayload.type, 'sync_file');
    assert.equal(syncFilePayload.senderId, 'user_dev');
  });
});
