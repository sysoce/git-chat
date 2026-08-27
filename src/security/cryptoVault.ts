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
export function base64ToBuffer(base64: string): Uint8Array {
  let binary = '';
  if (typeof Buffer !== 'undefined') {
    binary = Buffer.from(base64, 'base64').toString('binary');
  } else {
    binary = atob(base64);
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ============================================================================
// PURE JAVASCRIPT CRYPTOGRAPHIC ENGINE
// (Fallback for non-secure contexts on Mobile LAN where crypto.subtle is disabled)
// ============================================================================

// --- SHA-256 Implementation ---
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const ror = (x: number, n: number) => ((x >>> n) | (x << (32 - n))) >>> 0;

export function pureJsSha256(data: Uint8Array): Uint8Array {
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const len = data.length;
  const bitLenHi = Math.floor(len / 0x20000000);
  const bitLenLo = (len * 8) >>> 0;

  const paddedLen = Math.ceil((len + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[len] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, bitLenHi, false);
  view.setUint32(paddedLen - 4, bitLenLo, false);

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (ror(w[i - 15]!, 7) ^ ror(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)) >>> 0;
      const s1 = (ror(w[i - 2]!, 17) ^ ror(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)) >>> 0;
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const s1 = (ror(e, 6) ^ ror(e, 11) ^ ror(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + s1 + ch + K256[i]! + w[i]!) >>> 0;
      const s0 = (ror(a, 2) ^ ror(a, 13) ^ ror(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (s0 + maj) >>> 0;

      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

// --- HMAC-SHA-256 ---
export function pureJsHmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  let k = key;
  if (k.length > 64) {
    k = pureJsSha256(k);
  }
  const kPad = new Uint8Array(64);
  kPad.set(k);

  const iPad = new Uint8Array(64);
  const oPad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) {
    iPad[i] = kPad[i]! ^ 0x36;
    oPad[i] = kPad[i]! ^ 0x5c;
  }

  const inner = new Uint8Array(64 + data.length);
  inner.set(iPad, 0);
  inner.set(data, 64);
  const innerHash = pureJsSha256(inner);

  const outer = new Uint8Array(64 + 32);
  outer.set(oPad, 0);
  outer.set(innerHash, 64);
  return pureJsSha256(outer);
}

// --- PBKDF2-HMAC-SHA-256 ---
export function pureJsPbkdf2(
  passphrase: string,
  salt: string | Uint8Array,
  iterations = 100_000,
  keyLen = 32
): Uint8Array {
  const enc = new TextEncoder();
  const passBytes = enc.encode(passphrase);
  const saltBytes = typeof salt === 'string' ? enc.encode(salt) : salt;

  const numBlocks = Math.ceil(keyLen / 32);
  const out = new Uint8Array(numBlocks * 32);

  for (let blockIdx = 1; blockIdx <= numBlocks; blockIdx++) {
    const saltBlock = new Uint8Array(saltBytes.length + 4);
    saltBlock.set(saltBytes, 0);
    new DataView(saltBlock.buffer).setUint32(saltBytes.length, blockIdx, false);

    let u = pureJsHmacSha256(passBytes, saltBlock);
    const blockXor = new Uint8Array(u);

    for (let iter = 1; iter < iterations; iter++) {
      u = pureJsHmacSha256(passBytes, u);
      for (let j = 0; j < 32; j++) {
        blockXor[j]! ^= u[j]!;
      }
    }
    out.set(blockXor, (blockIdx - 1) * 32);
  }

  return out.subarray(0, keyLen);
}

// --- AES-256 SBOX & Constants ---
const SBOX = new Uint8Array([
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
]);

const RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];

function subWord(w: number): number {
  return (((SBOX[(w >>> 24) & 0xff]! << 24) |
          (SBOX[(w >>> 16) & 0xff]! << 16) |
          (SBOX[(w >>> 8) & 0xff]! << 8) |
          SBOX[w & 0xff]!) >>> 0);
}

function expandKey256(key: Uint8Array): Uint32Array {
  const w = new Uint32Array(60);
  for (let i = 0; i < 8; i++) {
    w[i] = ((key[4 * i]! << 24) | (key[4 * i + 1]! << 16) | (key[4 * i + 2]! << 8) | key[4 * i + 3]!) >>> 0;
  }
  for (let i = 8; i < 60; i++) {
    let temp = w[i - 1]!;
    if (i % 8 === 0) {
      const rot = ((temp << 8) | (temp >>> 24)) >>> 0;
      const sub = subWord(rot);
      const rconVal = (RCON[Math.floor(i / 8) - 1]! << 24) >>> 0;
      temp = (sub ^ rconVal) >>> 0;
    } else if (i % 8 === 4) {
      temp = subWord(temp);
    }
    w[i] = (w[i - 8]! ^ temp) >>> 0;
  }
  return w;
}

const g2 = (x: number) => ((x << 1) ^ ((x & 0x80) ? 0x11b : 0)) & 0xff;
const g3 = (x: number) => (g2(x) ^ x) & 0xff;

const T0 = new Uint32Array(256);
const T1 = new Uint32Array(256);
const T2 = new Uint32Array(256);
const T3 = new Uint32Array(256);

for (let i = 0; i < 256; i++) {
  const s = SBOX[i]!;
  const s2 = g2(s);
  const s3 = g3(s);
  T0[i] = ((s2 << 24) | (s << 16) | (s << 8) | s3) >>> 0;
  T1[i] = ((s3 << 24) | (s2 << 16) | (s << 8) | s) >>> 0;
  T2[i] = ((s << 24) | (s3 << 16) | (s2 << 8) | s) >>> 0;
  T3[i] = ((s << 24) | (s << 16) | (s3 << 8) | s2) >>> 0;
}

function encryptBlock256(block: Uint8Array, w: Uint32Array): Uint8Array {
  const inView = new DataView(block.buffer, block.byteOffset, 16);
  let s0 = (inView.getUint32(0, false) ^ w[0]!) >>> 0;
  let s1 = (inView.getUint32(4, false) ^ w[1]!) >>> 0;
  let s2 = (inView.getUint32(8, false) ^ w[2]!) >>> 0;
  let s3 = (inView.getUint32(12, false) ^ w[3]!) >>> 0;

  for (let r = 1; r <= 13; r++) {
    const k0 = w[r * 4]!;
    const k1 = w[r * 4 + 1]!;
    const k2 = w[r * 4 + 2]!;
    const k3 = w[r * 4 + 3]!;

    const t0 = (T0[(s0 >>> 24) & 0xff]! ^ T1[(s1 >>> 16) & 0xff]! ^ T2[(s2 >>> 8) & 0xff]! ^ T3[s3 & 0xff]! ^ k0) >>> 0;
    const t1 = (T0[(s1 >>> 24) & 0xff]! ^ T1[(s2 >>> 16) & 0xff]! ^ T2[(s3 >>> 8) & 0xff]! ^ T3[s0 & 0xff]! ^ k1) >>> 0;
    const t2 = (T0[(s2 >>> 24) & 0xff]! ^ T1[(s3 >>> 16) & 0xff]! ^ T2[(s0 >>> 8) & 0xff]! ^ T3[s1 & 0xff]! ^ k2) >>> 0;
    const t3 = (T0[(s3 >>> 24) & 0xff]! ^ T1[(s0 >>> 16) & 0xff]! ^ T2[(s1 >>> 8) & 0xff]! ^ T3[s2 & 0xff]! ^ k3) >>> 0;

    s0 = t0; s1 = t1; s2 = t2; s3 = t3;
  }

  const k0 = w[56]!, k1 = w[57]!, k2 = w[58]!, k3 = w[59]!;
  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);

  const t0 = (((SBOX[(s0 >>> 24) & 0xff]! << 24) | (SBOX[(s1 >>> 16) & 0xff]! << 16) | (SBOX[(s2 >>> 8) & 0xff]! << 8) | SBOX[s3 & 0xff]!) ^ k0) >>> 0;
  const t1 = (((SBOX[(s1 >>> 24) & 0xff]! << 24) | (SBOX[(s2 >>> 16) & 0xff]! << 16) | (SBOX[(s3 >>> 8) & 0xff]! << 8) | SBOX[s0 & 0xff]!) ^ k1) >>> 0;
  const t2 = (((SBOX[(s2 >>> 24) & 0xff]! << 24) | (SBOX[(s3 >>> 16) & 0xff]! << 16) | (SBOX[(s0 >>> 8) & 0xff]! << 8) | SBOX[s1 & 0xff]!) ^ k2) >>> 0;
  const t3 = (((SBOX[(s3 >>> 24) & 0xff]! << 24) | (SBOX[(s0 >>> 16) & 0xff]! << 16) | (SBOX[(s1 >>> 8) & 0xff]! << 8) | SBOX[s2 & 0xff]!) ^ k3) >>> 0;

  outView.setUint32(0, t0, false);
  outView.setUint32(4, t1, false);
  outView.setUint32(8, t2, false);
  outView.setUint32(12, t3, false);

  return out;
}

// Galois Field Multiplication in GF(2^128) for GHASH
function ghashMultiply(x: Uint8Array, y: Uint8Array): Uint8Array {
  const z = new Uint8Array(16);
  const v = new Uint8Array(y);

  for (let i = 0; i < 128; i++) {
    const bit = (x[Math.floor(i / 8)]! >>> (7 - (i % 8))) & 1;
    if (bit) {
      for (let j = 0; j < 16; j++) z[j]! ^= v[j]!;
    }
    const lsb = v[15]! & 1;
    for (let j = 15; j > 0; j--) {
      v[j] = ((v[j]! >>> 1) | ((v[j - 1]! & 1) << 7)) & 0xff;
    }
    v[0] = (v[0]! >>> 1) & 0xff;
    if (lsb) {
      v[0]! ^= 0xe1;
    }
  }
  return z;
}

function ghash(h: Uint8Array, data: Uint8Array): Uint8Array {
  let y: Uint8Array = new Uint8Array(16);
  const m = Math.ceil(data.length / 16);
  for (let i = 0; i < m; i++) {
    const block = new Uint8Array(16);
    block.set(data.subarray(i * 16, Math.min(data.length, (i + 1) * 16)));
    for (let j = 0; j < 16; j++) y[j]! ^= block[j]!;
    y = ghashMultiply(y, h) as Uint8Array;
  }
  return y;
}

export function pureJsAesGcmEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Uint8Array {
  const w = expandKey256(key);
  const zeroBlock = new Uint8Array(16);
  const h = encryptBlock256(zeroBlock, w);

  const j0 = new Uint8Array(16);
  j0.set(iv.subarray(0, 12));
  j0[15] = 1;

  const cb = new Uint8Array(j0);
  const incCb = () => {
    for (let i = 15; i >= 12; i--) {
      cb[i] = (cb[i]! + 1) & 0xff;
      if (cb[i] !== 0) break;
    }
  };

  const ciphertext = new Uint8Array(plaintext.length);
  const numBlocks = Math.ceil(plaintext.length / 16);
  for (let i = 0; i < numBlocks; i++) {
    incCb();
    const eCb = encryptBlock256(cb, w);
    const start = i * 16;
    const end = Math.min(plaintext.length, (i + 1) * 16);
    for (let j = 0; j < end - start; j++) {
      ciphertext[start + j] = plaintext[start + j]! ^ eCb[j]!;
    }
  }

  const lenBlock = new Uint8Array(16);
  const lenView = new DataView(lenBlock.buffer);
  lenView.setUint32(12, plaintext.length * 8, false);

  const ghashInput = new Uint8Array(Math.ceil(ciphertext.length / 16) * 16 + 16);
  ghashInput.set(ciphertext);
  ghashInput.set(lenBlock, Math.ceil(ciphertext.length / 16) * 16);

  const s = ghash(h, ghashInput);
  const tagMask = encryptBlock256(j0, w);
  const tag = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    tag[i] = s[i]! ^ tagMask[i]!;
  }

  const result = new Uint8Array(iv.length + ciphertext.length + tag.length);
  result.set(iv, 0);
  result.set(ciphertext, iv.length);
  result.set(tag, iv.length + ciphertext.length);
  return result;
}

export function pureJsAesGcmDecrypt(key: Uint8Array, encryptedBytes: Uint8Array): Uint8Array {
  if (encryptedBytes.length < 12 + 16) throw new Error('Ciphertext too short');
  const iv = encryptedBytes.subarray(0, 12);
  const tag = encryptedBytes.subarray(encryptedBytes.length - 16);
  const ciphertext = encryptedBytes.subarray(12, encryptedBytes.length - 16);

  const w = expandKey256(key);
  const zeroBlock = new Uint8Array(16);
  const h = encryptBlock256(zeroBlock, w);

  const j0 = new Uint8Array(16);
  j0.set(iv);
  j0[15] = 1;

  const lenBlock = new Uint8Array(16);
  const lenView = new DataView(lenBlock.buffer);
  lenView.setUint32(12, ciphertext.length * 8, false);

  const ghashInput = new Uint8Array(Math.ceil(ciphertext.length / 16) * 16 + 16);
  ghashInput.set(ciphertext);
  ghashInput.set(lenBlock, Math.ceil(ciphertext.length / 16) * 16);

  const s = ghash(h, ghashInput);
  const tagMask = encryptBlock256(j0, w);
  let tagMatch = true;
  for (let i = 0; i < 16; i++) {
    if ((s[i]! ^ tagMask[i]!) !== tag[i]) tagMatch = false;
  }
  if (!tagMatch) throw new Error('Authentication tag mismatch');

  const cb = new Uint8Array(j0);
  const incCb = () => {
    for (let i = 15; i >= 12; i--) {
      cb[i] = (cb[i]! + 1) & 0xff;
      if (cb[i] !== 0) break;
    }
  };

  const plaintext = new Uint8Array(ciphertext.length);
  const numBlocks = Math.ceil(ciphertext.length / 16);
  for (let i = 0; i < numBlocks; i++) {
    incCb();
    const eCb = encryptBlock256(cb, w);
    const start = i * 16;
    const end = Math.min(ciphertext.length, (i + 1) * 16);
    for (let j = 0; j < end - start; j++) {
      plaintext[start + j] = ciphertext[start + j]! ^ eCb[j]!;
    }
  }
  return plaintext;
}

// ============================================================================
// CRYPTO VAULT HIGH-LEVEL API
// ============================================================================

export type VaultKey = CryptoKey | Uint8Array;

/**
 * Derives a 256-bit AES-GCM CryptoKey from a user password and salt using PBKDF2.
 * Uses WebCrypto if available, or falls back to Pure JS.
 */
export async function deriveVaultKey(
  passphrase: string,
  saltStr: string = 'git-chat-e2ee-vault-salt'
): Promise<VaultKey> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto?.subtle) {
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

  // Pure JS Fallback
  return pureJsPbkdf2(passphrase, saltStr, 100_000, 32);
}

/**
 * Derives a 256-bit AES-GCM CryptoKey specifically for a 1-on-1 Direct Message conversation.
 */
export async function deriveDMKey(
  passphrase: string,
  userAId: string,
  userBId: string
): Promise<VaultKey> {
  const sorted = [userAId, userBId].sort();
  const dmSalt = `git-chat-dm-salt-${sorted[0]}-${sorted[1]}`;
  return deriveVaultKey(passphrase, dmSalt);
}

/**
 * Encrypts a plaintext string into an EncryptedPayload using AES-GCM-256.
 */
export async function encryptContent(
  plaintext: string,
  key: VaultKey
): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // Generate 12-byte random IV
  const iv = new Uint8Array(12);
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(iv);
  } else {
    for (let i = 0; i < 12; i++) iv[i] = Math.floor(Math.random() * 256);
  }

  if (key instanceof Uint8Array || !globalThis.crypto?.subtle) {
    const keyBytes = key instanceof Uint8Array ? key : new Uint8Array(32);
    const fullEnc = pureJsAesGcmEncrypt(keyBytes, iv, data);
    const encIv = fullEnc.subarray(0, 12);
    const encCiphertextWithTag = fullEnc.subarray(12);

    return {
      v: 1,
      alg: 'AES-GCM-256',
      iv: bufferToBase64(encIv),
      ciphertext: bufferToBase64(encCiphertextWithTag),
    };
  }

  const subtle = globalThis.crypto.subtle;
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
  key: VaultKey
): Promise<string> {
  const iv = base64ToBuffer(payload.iv);
  const ciphertext = base64ToBuffer(payload.ciphertext);

  if (key instanceof Uint8Array || !globalThis.crypto?.subtle) {
    const keyBytes = key instanceof Uint8Array ? key : new Uint8Array(32);
    const combined = new Uint8Array(iv.length + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, iv.length);

    const decryptedBytes = pureJsAesGcmDecrypt(keyBytes, combined);
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBytes);
  }

  const subtle = globalThis.crypto.subtle;
  const decryptedBuffer = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as any,
    },
    key,
    ciphertext as any
  );

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}
