import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { storageGet, storageSet, StorageKeys } from '../storage/db';
import { setHapticsEnabled as applyHapticsEnabled } from '../haptics';
import { setKeepAwake } from '../keepAwake';

export const TEXT_SCALES = [0.9, 1, 1.15, 1.3] as const;
export type TextScale = (typeof TEXT_SCALES)[number];

interface SettingsContextValue {
  hapticsEnabled: boolean;
  setHapticsEnabled: (enabled: boolean) => void;

  keepAwakeEnabled: boolean;
  setKeepAwakeEnabled: (enabled: boolean) => void;

  textScale: TextScale;
  setTextScale: (scale: TextScale) => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

/** Text Size is a page zoom. --text-scale mirrors it so fixed-geometry chrome (the bottom nav,
 *  drawn to an exact mockup) can cancel the zoom and keep its proportions. */
function applyTextScale(scale: number) {
  document.documentElement.style.zoom = String(scale);
  document.documentElement.style.setProperty('--text-scale', String(scale));
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [hapticsEnabled, setHapticsEnabledState] = useState(() => storageGet(StorageKeys.hapticsEnabled, true));
  const [keepAwakeEnabled, setKeepAwakeEnabledState] = useState(() =>
    storageGet(StorageKeys.keepAwakeEnabled, false),
  );
  const [textScale, setTextScaleState] = useState<TextScale>(() => storageGet(StorageKeys.textScale, 1));

  function setHapticsEnabled(enabled: boolean) {
    setHapticsEnabledState(enabled);
    storageSet(StorageKeys.hapticsEnabled, enabled);
    applyHapticsEnabled(enabled);
  }

  function setKeepAwakeEnabled(enabled: boolean) {
    setKeepAwakeEnabledState(enabled);
    storageSet(StorageKeys.keepAwakeEnabled, enabled);
    setKeepAwake(enabled);
  }

  function setTextScale(scale: TextScale) {
    setTextScaleState(scale);
    storageSet(StorageKeys.textScale, scale);
    applyTextScale(scale);
  }

  // Apply the persisted settings to their native/CSS side effects once on startup -- the
  // setters above only fire from here on when the user actually changes something.
  useEffect(() => {
    applyHapticsEnabled(hapticsEnabled);
    setKeepAwake(keepAwakeEnabled);
    applyTextScale(textScale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        hapticsEnabled,
        setHapticsEnabled,
        keepAwakeEnabled,
        setKeepAwakeEnabled,
        textScale,
        setTextScale,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
