import { storageGet, storageRemove, storageSet, StorageKeys } from '../storage/db';

/* Wrong-PIN throttling shared by every place a Vault PIN can be typed: the Vault screen itself
   and Desk > Settings > Vault Security (turning on biometric unlock). A 4-digit PIN is only
   10,000 possibilities, so after a few genuine typos the cost of each further guess escalates,
   and no entry point may skip that. */

const LOCKOUT_FREE_ATTEMPTS = 5;
const LOCKOUT_SCHEDULE_SEC = [30, 60, 120, 300, 600, 1800]; // 30s, 1m, 2m, 5m, 10m, 30m (cap)

export function lockoutMsFor(failedAttempts: number): number {
  if (failedAttempts < LOCKOUT_FREE_ATTEMPTS) return 0;
  const tier = Math.min(failedAttempts - LOCKOUT_FREE_ATTEMPTS, LOCKOUT_SCHEDULE_SEC.length - 1);
  return LOCKOUT_SCHEDULE_SEC[tier] * 1000;
}

const MAX_LOCKOUT_MS = LOCKOUT_SCHEDULE_SEC[LOCKOUT_SCHEDULE_SEC.length - 1] * 1000;

/** A stored lock-until time, never further away than the longest lockout: if the phone's clock was
 *  ahead when the lockout started and is corrected afterwards, the wait must not grow with it. */
export function clampLockedUntil(until: number): number {
  return Math.min(until, Date.now() + MAX_LOCKOUT_MS);
}

/** Epoch millis until which PIN entry is refused, or 0. */
export function vaultLockedUntil(): number {
  return clampLockedUntil(storageGet(StorageKeys.vaultLockedUntil, 0));
}

export function isVaultLockedOut(): boolean {
  return vaultLockedUntil() > Date.now();
}

/** Records a wrong guess; returns the new lock-until time (0 when no lockout applies yet). */
export function recordVaultFailedAttempt(): number {
  const failedAttempts = storageGet(StorageKeys.vaultFailedAttempts, 0) + 1;
  storageSet(StorageKeys.vaultFailedAttempts, failedAttempts);
  const lockoutMs = lockoutMsFor(failedAttempts);
  if (lockoutMs <= 0) return 0;
  const until = Date.now() + lockoutMs;
  storageSet(StorageKeys.vaultLockedUntil, until);
  return until;
}

export function clearVaultFailedAttempts(): void {
  storageSet(StorageKeys.vaultFailedAttempts, 0);
  storageRemove(StorageKeys.vaultLockedUntil);
}

/** "1:05" style countdown for a lockout that ends at `until`. */
export function formatLockoutRemaining(until: number, now: number): string {
  const totalSec = Math.max(0, Math.ceil((until - now) / 1000));
  return `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, '0')}`;
}
