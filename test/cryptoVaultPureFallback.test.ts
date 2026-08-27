import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveVaultKey,
  deriveDMKey,
  encryptContent,
  decryptContent,
  pureJsPbkdf2,
  pureJsAesGcmEncrypt,
  pureJsAesGcmDecrypt,
  bufferToBase64,
  base64ToBuffer,
} from '../src/security/cryptoVault';

test('Pure JS Crypto & WebCrypto Interoperability Suite', async (t) => {
  const passphrase = 'MySuperSecretVaultPassword2026!';
  const salt = 'git-chat-e2ee-vault-salt';

  await t.test('PBKDF2 derivation matches between Pure JS and WebCrypto', async () => {
    const webKey = await deriveVaultKey(passphrase, salt);
    const pureKeyBytes = pureJsPbkdf2(passphrase, salt, 100_000, 32);

    assert.equal(pureKeyBytes.length, 32);

    // Encrypt with WebCrypto, decrypt with Pure JS using pureKeyBytes
    const plaintext = 'Zero-backend Git-Chat is awesome!';
    const webEncrypted = await encryptContent(plaintext, webKey);

    const iv = base64ToBuffer(webEncrypted.iv);
    const ctWithTag = base64ToBuffer(webEncrypted.ciphertext);
    const combined = new Uint8Array(iv.length + ctWithTag.length);
    combined.set(iv, 0);
    combined.set(ctWithTag, iv.length);

    const pureDecryptedBytes = pureJsAesGcmDecrypt(pureKeyBytes, combined);
    const pureDecryptedText = new TextDecoder().decode(pureDecryptedBytes);
    assert.equal(pureDecryptedText, plaintext);
  });

  await t.test('Pure JS encrypted payload can be decrypted by WebCrypto', async () => {
    const pureKeyBytes = pureJsPbkdf2(passphrase, salt, 100_000, 32);
    const webKey = await deriveVaultKey(passphrase, salt);

    const iv = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const plaintext = 'Testing phone to computer encrypted stream! 📱 -> 💻';
    const ptBytes = new TextEncoder().encode(plaintext);

    const pureEnc = pureJsAesGcmEncrypt(pureKeyBytes, iv, ptBytes);
    const encIv = pureEnc.subarray(0, 12);
    const encCtTag = pureEnc.subarray(12);

    const payload = {
      v: 1 as const,
      alg: 'AES-GCM-256' as const,
      iv: bufferToBase64(encIv),
      ciphertext: bufferToBase64(encCtTag),
    };

    const webDecrypted = await decryptContent(payload, webKey);
    assert.equal(webDecrypted, plaintext);
  });

  await t.test('Pure JS encryptContent and decryptContent using raw Uint8Array key', async () => {
    const pureKeyBytes = pureJsPbkdf2(passphrase, salt, 100_000, 32);
    const plaintext = 'End-to-End messaging without crypto.subtle on Mobile LAN';

    const payload = await encryptContent(plaintext, pureKeyBytes as any);
    assert.equal(payload.v, 1);
    assert.equal(payload.alg, 'AES-GCM-256');

    const decrypted = await decryptContent(payload, pureKeyBytes as any);
    assert.equal(decrypted, plaintext);
  });

  await t.test('Pure JS DM Key Derivation matches WebCrypto DM Key Derivation', async () => {
    const userA = 'user_alice';
    const userB = 'user_bob';

    const webDmKey = await deriveDMKey(passphrase, userA, userB);

    const sorted = [userA, userB].sort();
    const dmSalt = `git-chat-dm-salt-${sorted[0]}-${sorted[1]}`;
    const pureDmKeyBytes = pureJsPbkdf2(passphrase, dmSalt, 100_000, 32);

    const secretDm = 'Private direct message between Alice and Bob';
    const payload = await encryptContent(secretDm, pureDmKeyBytes as any);
    const decrypted = await decryptContent(payload, webDmKey);
    assert.equal(decrypted, secretDm);
  });
});
