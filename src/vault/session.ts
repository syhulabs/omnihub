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

/** Shortest time in the background that locks an open Vault, even on "Immediately": a moment in
 *  the app switcher or a system dialog shouldn't throw the user out mid-note. */
const MIN_BACKGROUND_LOCK_MS = 10_000;

/** Whether an open Vault should lock after `backgroundMs` with the app in the background. */
export function shouldLockAfterBackground(backgroundMs: number): boolean {
  const minutes = vaultAutoLockMinutes();
  if (minutes === NEVER) return false;
  return backgroundMs >= Math.max(minutes * 60_000, MIN_BACKGROUND_LOCK_MS);
}

/* The Vault's own file picker and share sheet send the app to the background while the user is
   still working in the Vault. Locking on the way back would drop the key the picked file is about
   to be encrypted with, so those flows announce themselves first. The announcement only covers a
   trip to the background that starts within a few seconds of it: a picker or sheet that never
   leaves the app (iOS, a cancelled Android sheet, an export with nothing to export) must not
   leave the Vault exempt from locking when the user later puts the phone away. */
const EXTERNAL_ACTIVITY_WINDOW_MS = 8_000;
let externalActivityAt = 0;

export function expectVaultExternalActivity() {
  externalActivityAt = Date.now();
}

/** True when the app went to the background at `backgroundedAt` because of an announced picker or
 *  share sheet. Each announcement is used at most once. */
export function consumeVaultExternalActivity(backgroundedAt: number): boolean {
  const since = backgroundedAt - externalActivityAt;
  externalActivityAt = 0;
  return since >= 0 && since <= EXTERNAL_ACTIVITY_WINDOW_MS;
}

/** Explicit lock, PIN change or reset: nothing may survive it. */
export function forgetVaultKey() {
  parked = null;
}
