import { storageGet, StorageKeys } from '../storage/db';

/* Vault auto-lock (Desk > Settings > Vault Security). The Vault screen unmounts whenever the
   user leaves it, which used to always mean re-entering the PIN. With a grace period chosen,
   the derived key is parked here in memory on the way out and handed back if the user returns
   in time. It is never written to storage, so a process restart always locks. */

const IMMEDIATELY = 0;
const NEVER = -1;

let parked: { key: CryptoKey; leftAt: number } | null = null;

export function vaultAutoLockMinutes(): number {
  return storageGet(StorageKeys.vaultAutoLockMinutes, IMMEDIATELY);
}

/** Call when leaving the Vault while unlocked. */
export function parkVaultKey(key: CryptoKey | null) {
  if (!key || vaultAutoLockMinutes() === IMMEDIATELY) {
    parked = null;
    return;
  }
  parked = { key, leftAt: Date.now() };
}

/** The still-valid parked key, if any. Expired or disabled grace periods clear it. */
export function resumeVaultKey(): CryptoKey | null {
  if (!parked) return null;
  const minutes = vaultAutoLockMinutes();
  const expired = minutes === IMMEDIATELY || (minutes !== NEVER && Date.now() - parked.leftAt > minutes * 60_000);
  if (expired) {
    parked = null;
    return null;
  }
  return parked.key;
}

/** Explicit lock, PIN change or reset: nothing may survive it. */
export function forgetVaultKey() {
  parked = null;
}
