import { BiometricPlugin, biometricErrorCode } from '../biometric/plugin';
import { storageGet, storageSet, StorageKeys } from '../storage/db';
import { clearVaultFailedAttempts, isVaultLockedOut, recordVaultFailedAttempt } from './lockout';
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

export type EnableResult = 'ok' | 'wrong-pin' | 'locked-out' | 'no-vault' | 'unavailable';

async function keyOpensVault(key: CryptoKey, canary: EncryptedPayload): Promise<boolean> {
  try {
    return (await decryptText(key, canary)) === VAULT_CANARY_TEXT;
  } catch {
    return false;
  }
}

/** Verifies the PIN against the Vault's canary, then stores the derived key for biometric unlock.
 *  Wrong guesses count toward the same lockout as the Vault screen: this must not be a side door. */
export async function enableVaultBiometric(pin: string): Promise<EnableResult> {
  const salt = storageGet<string | null>(StorageKeys.vaultSalt, null);
  const canary = storageGet<EncryptedPayload | null>(StorageKeys.vaultCanary, null);
  if (!salt || !canary) return 'no-vault';
  if (isVaultLockedOut()) return 'locked-out';

  const bits = await deriveVaultKeyBits(pin, salt);
  const key = await importVaultKey(bits);
  if (!(await keyOpensVault(key, canary))) {
    recordVaultFailedAttempt();
    return 'wrong-pin';
  }
  clearVaultFailedAttempts();

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
    const key = await importVaultKey(fromBase64(secret));
    // A restored backup or a reset Vault leaves a stored key that no longer matches: fall back
    // to the PIN rather than "unlocking" into undecryptable notes and writing with a stale key.
    const canary = storageGet<EncryptedPayload | null>(StorageKeys.vaultCanary, null);
    if (!canary || !(await keyOpensVault(key, canary))) {
      await disableVaultBiometric();
      return null;
    }
    return key;
  } catch (err) {
    const code = biometricErrorCode(err);
    // The native side has nothing usable anymore: stop offering a button that can't work.
    if (code === 'no_secret' || code === 'invalid') await disableVaultBiometric();
    return null;
  }
}
