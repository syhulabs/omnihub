import { BiometricPlugin, biometricErrorCode } from '../biometric/plugin';
import { storageGet, storageSet, StorageKeys } from '../storage/db';
import {
  VAULT_CANARY_TEXT,
  decryptText,
  deriveVaultKeyBits,
  fromBase64,
  importVaultKey,
  toBase64,
  type EncryptedPayload,
} from './crypto';

/* Vault fingerprint/face unlock. The Vault's AES key is derived from the PIN, so to open it
   without the PIN the raw key bytes have to be kept somewhere: they live in the native plugin's
   Keystore-encrypted store and only come back after the system biometric prompt succeeds. */

export function isVaultBiometricEnabled(): boolean {
  return storageGet(StorageKeys.vaultBiometricEnabled, false);
}

export type EnableResult = 'ok' | 'wrong-pin' | 'no-vault' | 'unavailable';

/** Verifies the PIN against the Vault's canary, then stores the derived key for biometric unlock. */
export async function enableVaultBiometric(pin: string): Promise<EnableResult> {
  const salt = storageGet<string | null>(StorageKeys.vaultSalt, null);
  const canary = storageGet<EncryptedPayload | null>(StorageKeys.vaultCanary, null);
  if (!salt || !canary) return 'no-vault';

  const bits = await deriveVaultKeyBits(pin, salt);
  const key = await importVaultKey(bits);
  try {
    if ((await decryptText(key, canary)) !== VAULT_CANARY_TEXT) return 'wrong-pin';
  } catch {
    return 'wrong-pin';
  }

  try {
    await BiometricPlugin.storeSecret({ secret: toBase64(bits) });
  } catch {
    return 'unavailable';
  }
  storageSet(StorageKeys.vaultBiometricEnabled, true);
  return 'ok';
}

/** After a PIN change: the stored key must follow the new PIN or biometric unlock would open nothing. */
export async function refreshVaultBiometricSecret(bits: Uint8Array): Promise<void> {
  if (!isVaultBiometricEnabled()) return;
  try {
    await BiometricPlugin.storeSecret({ secret: toBase64(bits) });
  } catch {
    await disableVaultBiometric();
  }
}

export async function disableVaultBiometric(): Promise<void> {
  storageSet(StorageKeys.vaultBiometricEnabled, false);
  try {
    await BiometricPlugin.clearSecret();
  } catch {
    // Nothing stored natively (web), nothing to clear.
  }
}

/** Shows the prompt; resolves the Vault key on success, null if cancelled or unavailable. */
export async function unlockVaultWithBiometric(): Promise<CryptoKey | null> {
  try {
    const { secret } = await BiometricPlugin.retrieveSecret({
      title: 'Unlock Vault',
      subtitle: 'Use your fingerprint or face',
      negativeButtonText: 'Use PIN',
    });
    return await importVaultKey(fromBase64(secret));
  } catch (err) {
    const code = biometricErrorCode(err);
    // The native side has nothing usable anymore: stop offering a button that can't work.
    if (code === 'no_secret' || code === 'invalid') await disableVaultBiometric();
    return null;
  }
}
