import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PinPad } from '../vault/PinPad';
import { Icon } from '../components/Icon';
import { storageGet, StorageKeys } from '../storage/db';
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
    if (value.length !== 4) return;

    const salt = storageGet<string>(StorageKeys.appLockPinSalt, '');
    const storedHash = storageGet<string>(StorageKeys.appLockPinHash, '');
    const hash = await hashPin(value, salt);

    if (hash === storedHash) {
      setUnlocked(true);
    } else {
      setError('Incorrect PIN');
      setPinInput('');
    }
  }

  if (unlocked) return <>{children}</>;

  return (
    <div className="screen">
      <PinPad
        title="Enter PIN"
        subtitle="Unlock Omni Hub"
        value={pinInput}
        onChange={(v) => void onPinChange(v)}
        error={error}
        action={
          biometricReady ? (
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
