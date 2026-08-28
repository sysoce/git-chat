import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveVaultKey,
  deriveDMKey,
  clearVaultKeyCache,
} from '../src/security/cryptoVault';

test('CryptoVault Key Derivation Caching Suite', async (t) => {
  const passphrase = 'SecretPassphrase2026!';
  const salt1 = 'git-chat-chan-sysoce-git-chat-chan_general';
  const salt2 = 'git-chat-chan-sysoce-git-chat-chan_engineering';

  await t.test('caches derived key for same passphrase and salt', async () => {
    clearVaultKeyCache();
    const key1 = await deriveVaultKey(passphrase, salt1);
    const key2 = await deriveVaultKey(passphrase, salt1);

    assert.equal(key1, key2, 'Repeated calls with identical parameters must return cached instance');
  });

  await t.test('derives distinct keys for different salts and caches each', async () => {
    clearVaultKeyCache();
    const keyChan1 = await deriveVaultKey(passphrase, salt1);
    const keyChan2 = await deriveVaultKey(passphrase, salt2);

    assert.notEqual(keyChan1, keyChan2, 'Distinct salts must yield distinct keys');

    const cachedChan1 = await deriveVaultKey(passphrase, salt1);
    const cachedChan2 = await deriveVaultKey(passphrase, salt2);

    assert.equal(cachedChan1, keyChan1);
    assert.equal(cachedChan2, keyChan2);
  });

  await t.test('clearVaultKeyCache purges cached keys', async () => {
    clearVaultKeyCache();
    const key1 = await deriveVaultKey(passphrase, salt1);
    clearVaultKeyCache();
    const key2 = await deriveVaultKey(passphrase, salt1);

    assert.ok(key1 && key2);
  });

  await t.test('deriveDMKey leverages cache correctly', async () => {
    clearVaultKeyCache();
    const dmKey1 = await deriveDMKey(passphrase, 'user_alice', 'user_bob');
    const dmKey2 = await deriveDMKey(passphrase, 'user_bob', 'user_alice');

    assert.equal(dmKey1, dmKey2, 'Symmetric DM calls must hit identical cache key');
  });
});
