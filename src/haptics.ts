import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

let hapticsEnabled = true;

/** Set once from SettingsContext on load and whenever the user toggles Haptic Feedback. */
export function setHapticsEnabled(enabled: boolean) {
  hapticsEnabled = enabled;
}

async function safe(fn: () => Promise<void>) {
  if (!hapticsEnabled) return;
  try {
    await fn();
  } catch {
    // Haptics unavailable (web without vibration support, etc.) — ignore.
  }
}

export function hapticTap() {
  void safe(() => Haptics.impact({ style: ImpactStyle.Light }));
}

export function hapticSelect() {
  void safe(() => Haptics.selectionChanged());
}

export function hapticSuccess() {
  void safe(() => Haptics.notification({ type: NotificationType.Success }));
}

export function hapticWarning() {
  void safe(() => Haptics.notification({ type: NotificationType.Warning }));
}
