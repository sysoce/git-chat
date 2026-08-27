import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveVaultKey, deriveDMKey, encryptContent, decryptContent } from '../src/security/cryptoVault';
import { getDmChannelId, parseDmChannelUsers } from '../src/types/chat';
import { DataIsolationGuard } from '../src/security/dataIsolationGuard';

test('Multi-User & Cross-Device Communication Suite', async (t) => {
  await t.test('Common Channel: User on Computer encrypts message, User on Phone decrypts with shared workspace key', async () => {
    const workspacePassphrase = 'team-production-vault-2026';

    // Computer derives key from workspace passphrase
    const computerKey = await deriveVaultKey(workspacePassphrase);
    const plaintext = 'Deployment to production was successful! 🚀';

    // Computer encrypts message for #general
    const encryptedPayload = await encryptContent(plaintext, computerKey);
    assert.strictEqual(encryptedPayload.alg, 'AES-GCM-256');

    // Phone derives key from same workspace passphrase
    const phoneKey = await deriveVaultKey(workspacePassphrase);

    // Phone decrypts message
    const decryptedOnPhone = await decryptContent(encryptedPayload, phoneKey);
    assert.strictEqual(decryptedOnPhone, plaintext);
  });

  await t.test('DM Channels: Deterministic channel IDs for 1-on-1 conversations regardless of user order', () => {
    const dm1 = getDmChannelId('user_alice', 'user_bob');
    const dm2 = getDmChannelId('user_bob', 'user_alice');
    assert.strictEqual(dm1, 'chan_dm_user_alice__user_bob');
    assert.strictEqual(dm1, dm2);

    const parsed = parseDmChannelUsers(dm1);
    assert.ok(parsed);
    assert.strictEqual(parsed[0], 'user_alice');
    assert.strictEqual(parsed[1], 'user_bob');
  });

  await t.test('DM Channels: 1-on-1 E2EE encryption derived between specific users', async () => {
    const workspacePassphrase = 'shared-workspace-pass';

    // Alice on Computer derives DM key for conversation with Bob
    const aliceDmKey = await deriveDMKey(workspacePassphrase, 'user_alice', 'user_bob');
    const secretDm = 'Hey Bob, here is the private API key.';

    const encryptedDm = await encryptContent(secretDm, aliceDmKey);

    // Bob on Phone derives DM key for conversation with Alice
    const bobDmKey = await deriveDMKey(workspacePassphrase, 'user_bob', 'user_alice');
    const decryptedByBob = await decryptContent(encryptedDm, bobDmKey);
    assert.strictEqual(decryptedByBob, secretDm);

    // Eve on another channel cannot decrypt with a different DM key
    const eveDmKey = await deriveDMKey(workspacePassphrase, 'user_eve', 'user_alice');
    await assert.rejects(async () => {
      await decryptContent(encryptedDm, eveDmKey);
    });
  });

  await t.test('User Profile & Discovery files conform to DataIsolationGuard rules', () => {
    // User Alice publishes profile
    assert.ok(DataIsolationGuard.validateWritePath('users/user_alice.json', 'user_alice'));
    // User Bob publishes profile
    assert.ok(DataIsolationGuard.validateWritePath('users/user_bob.json', 'user_bob'));
    // User Alice posts in their DM channel
    assert.ok(
      DataIsolationGuard.validateWritePath(
        'channels/chan_dm_user_alice__user_bob/messages/1700000000_user_alice_msg123.json',
        'user_alice'
      )
    );
  });
});
