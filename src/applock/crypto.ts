const SALT_BYTES = 16;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function randomSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)));
}

/** App Lock only needs to verify a PIN, never decrypt anything with it, so a salted SHA-256
 *  digest is enough -- unlike the Vault's PBKDF2-derived AES key, there's no ciphertext here that
 *  the PIN itself has to reconstitute. */
export async function hashPin(pin: string, saltB64: string): Promise<string> {
  const data = new TextEncoder().encode(`${saltB64}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toBase64(new Uint8Array(digest));
}
