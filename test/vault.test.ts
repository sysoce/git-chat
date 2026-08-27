import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { deriveVaultKey, encryptContent, decryptContent } from '../src/security/cryptoVault';

describe('CryptoVault End-to-End Encryption (E2EE) Suite', () => {
  const passphrase = 'SuperSecretVaultPassword123!';
  const salt = 'workspace-git-chat-salt';

  it('derives a valid AES-GCM CryptoKey from password and salt', async () => {
    const key = await deriveVaultKey(passphrase, salt);
    assert.ok(key);
    assert.equal(key.algorithm.name, 'AES-GCM');
    assert.equal((key.algorithm as any).length, 256);
  });

  it('encrypts and decrypts a message accurately (round-trip)', async () => {
    const key = await deriveVaultKey(passphrase, salt);
    const plaintext = 'Hello team! This message is protected by military-grade AES-GCM-256.';

    const encrypted = await encryptContent(plaintext, key);
    assert.equal(encrypted.v, 1);
    assert.equal(encrypted.alg, 'AES-GCM-256');
    assert.ok(encrypted.iv);
    assert.ok(encrypted.ciphertext);
    assert.notEqual(encrypted.ciphertext, plaintext);

    const decrypted = await decryptContent(encrypted, key);
    assert.equal(decrypted, plaintext);
  });

  it('fails decryption cleanly when given an incorrect password', async () => {
    const correctKey = await deriveVaultKey('correct_password', salt);
    const wrongKey = await deriveVaultKey('wrong_password', salt);

    const plaintext = 'Secret internal memo';
    const encrypted = await encryptContent(plaintext, correctKey);

    await assert.rejects(async () => {
      await decryptContent(encrypted, wrongKey);
    });
  });

  it('fails decryption if ciphertext payload is corrupted', async () => {
    const key = await deriveVaultKey(passphrase, salt);
    const encrypted = await encryptContent('Original text', key);

    const tamperedPayload = {
      ...encrypted,
      ciphertext: encrypted.ciphertext.slice(0, -4) + 'AAAA',
    };

    await assert.rejects(async () => {
      await decryptContent(tamperedPayload, key);
    });
  });
});
