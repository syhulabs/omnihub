import { useState, type ReactNode } from 'react';
import { PinPad } from '../vault/PinPad';
import { storageGet, StorageKeys } from '../storage/db';
import { hashPin } from './crypto';

/** Gates the whole app behind a PIN when App Lock is on (Settings > Security). Checked once at
 *  mount -- the app re-renders this component fresh on every cold start/process restart, which is
 *  the only time Android actually tears the WebView down, so there's no separate "lock on
 *  background" timer to wire up here. */
export function AppLockGate({ children }: { children: ReactNode }) {
  const enabled = storageGet(StorageKeys.appLockEnabled, false);
  const [unlocked, setUnlocked] = useState(!enabled);
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');

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
      />
    </div>
  );
}
