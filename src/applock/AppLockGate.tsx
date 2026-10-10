import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PinPad } from '../vault/PinPad';
import { Icon } from '../components/Icon';
import { storageGet, storageRemove, storageSet, StorageKeys } from '../storage/db';
import { formatLockoutRemaining, lockoutMsFor } from '../vault/lockout';
import { BiometricPlugin } from '../biometric/plugin';
import { hashPin } from './crypto';

/** Gates the whole app behind a PIN when App Lock is on (Settings > Security). Checked once at
 *  mount -- the app re-renders this component fresh on every cold start/process restart, which is
 *  the only time Android actually tears the WebView down, so there's no separate "lock on
 *  background" timer to wire up here. With Biometric Unlock on, the system fingerprint/face prompt
 *  opens by itself first; the PIN pad underneath is always the fallback. */
export function AppLockGate({ children }: { children: ReactNode }) {
  const enabled = storageGet(StorageKeys.appLockEnabled, false);
  const biometricEnabled = enabled && storageGet(StorageKeys.appLockBiometricEnabled, false);
  const [unlocked, setUnlocked] = useState(!enabled);
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [biometricReady, setBiometricReady] = useState(false);
  const promptedRef = useRef(false);
  const [lockedUntil, setLockedUntil] = useState(() => storageGet(StorageKeys.appLockLockedUntil, 0));
  const [now, setNow] = useState(() => Date.now());
  const isLockedOut = lockedUntil > now;

  useEffect(() => {
    if (!isLockedOut) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isLockedOut]);

  useEffect(() => {
    if (unlocked || !biometricEnabled) return;
    let cancelled = false;
    BiometricPlugin.check()
      .then((r) => {
        if (cancelled || !r.available) return;
        setBiometricReady(true);
        if (!promptedRef.current) {
          promptedRef.current = true;
          void tryBiometric();
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryBiometric() {
    try {
      await BiometricPlugin.authenticate({
        title: 'Unlock Omni Hub',
        subtitle: 'Use your fingerprint or face',
        negativeButtonText: 'Use PIN',
      });
      setUnlocked(true);
    } catch {
      // Cancelled or failed: the PIN pad is the fallback.
    }
  }

  async function onPinChange(value: string) {
    setPinInput(value);
    if (value.length < 4) {
      if (error) setError('');
      return;
    }
    if (storageGet(StorageKeys.appLockLockedUntil, 0) > Date.now()) {
      setPinInput('');
      return;
    }

    const salt = storageGet<string>(StorageKeys.appLockPinSalt, '');
    const storedHash = storageGet<string>(StorageKeys.appLockPinHash, '');
    const hash = await hashPin(value, salt);

    if (hash === storedHash) {
      storageSet(StorageKeys.appLockFailedAttempts, 0);
      storageRemove(StorageKeys.appLockLockedUntil);
      setUnlocked(true);
    } else {
      // Same escalation as the Vault: a 4-digit PIN must not be guessable at full speed.
      const failed = storageGet(StorageKeys.appLockFailedAttempts, 0) + 1;
      storageSet(StorageKeys.appLockFailedAttempts, failed);
      const lockoutMs = lockoutMsFor(failed);
      if (lockoutMs > 0) {
        const until = Date.now() + lockoutMs;
        storageSet(StorageKeys.appLockLockedUntil, until);
        setLockedUntil(until);
        setNow(Date.now());
        setError('');
      } else {
        setError('Incorrect PIN');
      }
      setPinInput('');
    }
  }

  if (unlocked) return <>{children}</>;

  return (
    <div className="screen">
      <PinPad
        title="Enter PIN"
        subtitle={isLockedOut ? `Too many attempts. Try again in ${formatLockoutRemaining(lockedUntil, now)}` : 'Unlock Omni Hub'}
        value={pinInput}
        onChange={(v) => void onPinChange(v)}
        error={error}
        disabled={isLockedOut}
        action={
          biometricReady && !isLockedOut ? (
            <button type="button" className="vault-pin__action-btn" onClick={() => void tryBiometric()}>
              <Icon name="fingerprint" size={18} />
              Use fingerprint or face
            </button>
          ) : undefined
        }
      />
    </div>
  );
}
