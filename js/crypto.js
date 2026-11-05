// Password-based encryption of class data with WebCrypto (PBKDF2-SHA256 + AES-GCM-256).
// The same module runs in the browser and in Node >= 20 (globalThis.crypto), so the npm
// scripts that write data files and the app that reads them share one implementation.

const ITERATIONS = 310000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Error thrown when decryption fails: wrong password or tampered/corrupt data. */
export class DecryptError extends Error {
  constructor() {
    super('Decryption failed');
    this.code = 'wrongPassword';
  }
}

export function toBase64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromBase64(str) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0));
}

async function deriveKey(password, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Encrypts a JSON-serializable value into an envelope object with a fresh salt and IV. */
export async function encryptJson(value, password, { iterations = ITERATIONS } = {}) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const plain = encoder.encode(JSON.stringify(value));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iter: iterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(ct),
  };
}

/** Decrypts an envelope produced by encryptJson. Throws DecryptError on a wrong password. */
export async function decryptJson(envelope, password) {
  if (envelope?.v !== 1 || envelope.kdf !== 'PBKDF2-SHA256') {
    throw new Error('Unsupported data file format');
  }
  const key = await deriveKey(password, fromBase64(envelope.salt), envelope.iter);
  let plain;
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.iv) },
      key,
      fromBase64(envelope.ct),
    );
  } catch {
    throw new DecryptError();
  }
  return JSON.parse(decoder.decode(plain));
}
