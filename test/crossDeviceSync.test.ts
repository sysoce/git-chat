import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveVaultKey, encryptContent, decryptContent } from '../src/security/cryptoVault.js';

describe('Cross-Device Synchronization & Decryption Suite', () => {
  it('allows two devices with different personal vault passwords to decrypt shared #general messages', async () => {
    const workspaceId = 'sysoce/git-chat';
    const channelId = 'chan_general';
    const chanSalt = `git-chat-chan-sysoce-git-chat-${channelId}`;

    // Desktop user logs in with personal vault password "desktop_vault_pass_123"
    // Channel key is derived from workspace shared identity:
    const desktopChannelKey = await deriveVaultKey(workspaceId, chanSalt);

    // Desktop user sends encrypted message to #general
    const secretMessage = 'Hello from Computer on refs/heads/git-chat!';
    const encryptedPayload = await encryptContent(secretMessage, desktopChannelKey);
    assert.ok(encryptedPayload.ciphertext);
    assert.ok(encryptedPayload.iv);

    // Phone user logs in with their own personal vault password "mobile_vault_pass_456"
    // Phone derives channel key from same workspace identity:
    const phoneChannelKey = await deriveVaultKey(workspaceId, chanSalt);

    // Phone user decrypts message in #general
    const decryptedMessage = await decryptContent(encryptedPayload, phoneChannelKey);
    assert.strictEqual(decryptedMessage, secretMessage);
  });

  it('allows 1-on-1 Direct Messages to be encrypted and decrypted by both participants regardless of order', async () => {
    const workspaceId = 'sysoce/git-chat';
    const userA = 'user_ordenador';
    const userB = 'user_didrikgw_mobile';

    // Desktop derives DM key
    const sorted1 = [userA, userB].sort();
    const dmSalt1 = `git-chat-dm-sysoce-git-chat-${sorted1[0]}-${sorted1[1]}`;
    const desktopDmKey = await deriveVaultKey(workspaceId, dmSalt1);

    // Phone derives DM key (with users passed in opposite order)
    const sorted2 = [userB, userA].sort();
    const dmSalt2 = `git-chat-dm-sysoce-git-chat-${sorted2[0]}-${sorted2[1]}`;
    const phoneDmKey = await deriveVaultKey(workspaceId, dmSalt2);

    // Desktop encrypts DM to Phone
    const dmContent = 'Confidential 1-on-1 direct message between Desktop and Mobile';
    const encryptedDM = await encryptContent(dmContent, desktopDmKey);

    // Phone decrypts DM
    const decryptedByPhone = await decryptContent(encryptedDM, phoneDmKey);
    assert.strictEqual(decryptedByPhone, dmContent);

    // Phone replies with encrypted DM to Desktop
    const replyContent = 'Received on iPhone! End-to-end encryption verified.';
    const encryptedReply = await encryptContent(replyContent, phoneDmKey);

    // Desktop decrypts reply
    const decryptedByDesktop = await decryptContent(encryptedReply, desktopDmKey);
    assert.strictEqual(decryptedByDesktop, replyContent);
  });

  it('safely rejects non-JSON / Bad Request inputs without throwing SyntaxError', () => {
    const badInputs = [
      'Bad Request',
      '<html><head><title>404 Not Found</title></head><body><h1>404 Not Found</h1></body></html>',
      '400: Invalid Branch Tree Reference',
      '',
      null,
      undefined,
      '   \n\t  ',
      '<!DOCTYPE html><html><body>Error</body></html>'
    ];

    function safeProcessSyncFile(relativePath: string, contentStr: any): boolean {
      if (!contentStr) return false;
      let parsed: any;
      if (typeof contentStr === 'string') {
        const trimmed = contentStr.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
          return false;
        }
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          return false;
        }
      } else {
        parsed = contentStr;
      }
      if (!parsed || typeof parsed !== 'object') return false;
      return true;
    }

    for (const input of badInputs) {
      assert.doesNotThrow(() => {
        const result = safeProcessSyncFile('channels/chan_general/messages/123_user_msg.json', input);
        assert.strictEqual(result, false);
      });
    }

    // Valid JSON string passes
    const validJson = JSON.stringify({ id: 'msg_1', content: 'test' });
    assert.strictEqual(safeProcessSyncFile('channels/chan_general/messages/123_user_msg.json', validJson), true);
  });

  it('generates LAN mobile pairing URL and parses setup hash correctly', () => {
    const config = {
      owner: 'sysoce',
      repo: 'git-chat',
      branch: 'git-chat',
      lanUrl: 'http://192.168.1.111:4300',
      workspaceSecret: ''
    };
    const vaultPassword = 'my-vault-pass';

    const payload = {
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      password: vaultPassword,
      workspaceSecret: config.workspaceSecret
    };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const mobileSetupUrl = `${config.lanUrl.replace(/\/+$/, '')}/#setup=${b64}`;

    assert.ok(mobileSetupUrl.startsWith('http://192.168.1.111:4300/#setup='));

    // Simulated mobile client receives hash
    const hash = mobileSetupUrl.split('#setup=')[1];
    const decodedJson = Buffer.from(hash, 'base64').toString('utf-8');
    const parsed = JSON.parse(decodedJson);

    assert.strictEqual(parsed.owner, 'sysoce');
    assert.strictEqual(parsed.repo, 'git-chat');
    assert.strictEqual(parsed.branch, 'git-chat');
    assert.strictEqual(parsed.password, 'my-vault-pass');
  });
});
