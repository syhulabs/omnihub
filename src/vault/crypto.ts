const SALT_BYTES = 16;
const IV_BYTES = 12;
const PBKDF2_ITERATIONS = 150_000;

/** Encrypted at setup; decrypting it back to this text is how a PIN is verified. */
export const VAULT_CANARY_TEXT = 'omni-hub-vault-ok';

export interface EncryptedPayload {
  iv: string;
  data: string;
}

export function randomIv(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(IV_BYTES));
}

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/** The raw 256-bit key the PIN derives to. Only the biometric store ever needs these bytes;
 *  everything else works with the non-extractable CryptoKey from importVaultKey(). */
export async function deriveVaultKeyBits(pin: string, saltB64: string): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromBase64(saltB64) as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return new Uint8Array(bits);
}

export function importVaultKey(bits: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', bits as BufferSource, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function deriveVaultKey(pin: string, saltB64: string): Promise<CryptoKey> {
  return importVaultKey(await deriveVaultKeyBits(pin, saltB64));
}

export async function encryptText(key: CryptoKey, text: string): Promise<EncryptedPayload> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { iv: toBase64(iv), data: toBase64(new Uint8Array(cipher)) };
}

export async function decryptText(key: CryptoKey, payload: EncryptedPayload): Promise<string> {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(payload.iv) as BufferSource },
    key,
    fromBase64(payload.data) as BufferSource,
  );
  return new TextDecoder().decode(plain);
}

export async function encryptBytes(key: CryptoKey, bytes: ArrayBuffer): Promise<{ iv: Uint8Array; data: ArrayBuffer }> {
  const iv = randomIv();
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, bytes);
  return { iv, data };
}

export async function decryptBytes(key: CryptoKey, iv: Uint8Array, data: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, data);
}
