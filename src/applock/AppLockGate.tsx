import { useEffect, useRef, useState, type ReactNode } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { PinPad } from "../vault/PinPad";
import { useBackHandler } from "../app/useBackHandler";
import { Icon } from "../components/Icon";
import {
  storageGet,
  storageRemove,
  storageSet,
  StorageKeys,
} from "../storage/db";
import {
  clampLockedUntil,
  formatLockoutRemaining,
  lockoutMsFor,
} from "../vault/lockout";
import { BiometricPlugin } from "../biometric/plugin";
import { hashPin } from "./crypto";

/** How long the app may sit in the background before App Lock asks again. Long enough that a
 *  share sheet, a permission dialog or the biometric prompt itself doesn't re-lock the app. */
const BACKGROUND_GRACE_MS = 30_000;

/** Gates the whole app behind a PIN when App Lock is on (Settings > Security): at cold start, and
 *  again whenever the app comes back after more than BACKGROUND_GRACE_MS in the background (Android
 *  keeps the WebView alive for hours, so a cold-start check alone left the app open to whoever
 *  picked the phone up next). On a re-lock the app stays mounted underneath, hidden, so nothing
 *  the user was doing is lost. With Biometric Unlock on, the system fingerprint/face prompt opens
 *  by itself first; the PIN pad underneath is always the fallback. */
export function AppLockGate({ children }: { children: ReactNode }) {
  // Read fresh on every render: App Lock can be turned on or off in Settings while this is mounted.
  const enabled = storageGet(StorageKeys.appLockEnabled, false);
  const biometricEnabled =
    enabled && storageGet(StorageKeys.appLockBiometricEnabled, false);
  const [unlocked, setUnlocked] = useState(!enabled);
  // True once the app has been shown this run; from then on a lock hides it instead of unmounting it.
  const [appMounted, setAppMounted] = useState(!enabled);
  const backgroundedAtRef = useRef<number | null>(null);
  const [pinInput, setPinInput] = useState("");
  const [error, setError] = useState("");
  const [biometricReady, setBiometricReady] = useState(false);
  const promptedRef = useRef(false);
  const [lockedUntil, setLockedUntil] = useState(() =>
    clampLockedUntil(storageGet(StorageKeys.appLockLockedUntil, 0))
  );
  const [now, setNow] = useState(() => Date.now());
  const isLockedOut = lockedUntil > now;

  useEffect(() => {
    if (!isLockedOut) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [isLockedOut]);

  useEffect(() => {
    if (unlocked) setAppMounted(true);
  }, [unlocked]);

  // While locked, the hardware back button belongs to the lock screen. The app underneath stays
  // mounted (hidden) after a re-lock, and its own back handlers would otherwise act on it unseen:
  // discarding a half-typed expense, navigating, or exiting the app.
  useBackHandler(() => {}, !unlocked);

  useEffect(() => {
    const listener = CapacitorApp.addListener(
      "appStateChange",
      ({ isActive }) => {
        if (!isActive) {
          backgroundedAtRef.current = Date.now();
          return;
        }
        const backgroundedAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (
          backgroundedAt === null ||
          Date.now() - backgroundedAt < BACKGROUND_GRACE_MS
        )
          return;
        if (!storageGet(StorageKeys.appLockEnabled, false)) return;
        promptedRef.current = false;
        setPinInput("");
        setError("");
        setLockedUntil(
          clampLockedUntil(storageGet(StorageKeys.appLockLockedUntil, 0))
        );
        setNow(Date.now());
        setUnlocked(false);
      }
    );
    return () => {
      void listener.then((l) => l.remove());
    };
  }, []);

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
    // Runs at mount and again on every re-lock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  async function tryBiometric() {
    try {
      await BiometricPlugin.authenticate({
        title: "Unlock Omni Hub",
        subtitle: "Use your fingerprint or face",
        negativeButtonText: "Use PIN",
      });
      setUnlocked(true);
    } catch {
      // Cancelled or failed: the PIN pad is the fallback.
    }
  }

  async function onPinChange(value: string) {
    setPinInput(value);
    if (value.length < 4) {
      if (error) setError("");
      return;
    }
    if (storageGet(StorageKeys.appLockLockedUntil, 0) > Date.now()) {
      setPinInput("");
      return;
    }

    const salt = storageGet<string>(StorageKeys.appLockPinSalt, "");
    const storedHash = storageGet<string>(StorageKeys.appLockPinHash, "");
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
        setError("");
      } else {
        setError("Incorrect PIN");
      }
      setPinInput("");
    }
  }

  return (
    <>
      {/* One stable wrapper, shown or hidden, so locking and unlocking never remounts the app. */}
      {(unlocked || appMounted) && <div style={{ display: unlocked ? 'contents' : 'none' }}>{children}</div>}
      {!unlocked && (
        <div className="screen applock-gate">
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
      )}
    </>
  );
}
