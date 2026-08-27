import type { EncryptedPayload } from '../types/chat';

/**
 * Universal Base64 Encoding for Browser and Node.js
 */
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Universal Base64 Decoding for Browser and Node.js
 */
export function base64ToBuffer(base64: string): Uint8Array<ArrayBuffer> {
  let binary = '';
  if (typeof Buffer !== 'undefined') {
    binary = Buffer.from(base64, 'base64').toString('binary');
  } else {
    binary = atob(base64);
  }
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from a user password and salt using PBKDF2.
 */
export async function deriveVaultKey(
  passphrase: string,
  saltStr: string = 'git-chat-e2ee-vault-salt'
): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(passphrase);
  const saltBuffer = encoder.encode(saltStr);

  const baseKey = await subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBuffer,
      iterations: 100_000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Derives a 256-bit AES-GCM CryptoKey specifically for a 1-on-1 Direct Message conversation.
 */
export async function deriveDMKey(
  passphrase: string,
  userAId: string,
  userBId: string
): Promise<CryptoKey> {
  const sorted = [userAId, userBId].sort();
  const dmSalt = `git-chat-dm-salt-${sorted[0]}-${sorted[1]}`;
  return deriveVaultKey(passphrase, dmSalt);
}

/**
 * Encrypts a plaintext string into an EncryptedPayload using AES-GCM-256.
 */
export async function encryptContent(
  plaintext: string,
  key: CryptoKey
): Promise<EncryptedPayload> {
  const subtle = globalThis.crypto.subtle;
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // 12-byte standard nonce/IV for AES-GCM
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));

  const encryptedBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    data
  );

  return {
    v: 1,
    alg: 'AES-GCM-256',
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(encryptedBuffer),
  };
}

/**
 * Decrypts an EncryptedPayload into a plaintext string using AES-GCM-256.
 * Throws an error if the key is invalid or ciphertext is tampered.
 */
export async function decryptContent(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<string> {
  const subtle = globalThis.crypto.subtle;
  const iv = base64ToBuffer(payload.iv);
  const ciphertext = base64ToBuffer(payload.ciphertext);

  const decryptedBuffer = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
