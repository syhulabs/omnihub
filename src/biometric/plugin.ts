import { registerPlugin, WebPlugin } from '@capacitor/core';

export type BiometryType = 'fingerprint' | 'face' | 'iris' | 'multiple' | 'unknown' | 'none';

export interface BiometricCheck {
  /** True when at least one fingerprint or face is enrolled and usable right now. */
  available: boolean;
  reason: '' | 'none_enrolled' | 'no_hardware' | 'unavailable';
  /** Hardware present on the phone, whatever is enrolled. */
  type: BiometryType;
}

export interface PromptOptions {
  title: string;
  subtitle?: string;
  /** The prompt's fallback button; the prompt rejects with code "cancelled" when it's tapped. */
  negativeButtonText?: string;
}

/** Rejection codes from authenticate/retrieveSecret (the error's `code` field). */
export type BiometricErrorCode = 'cancelled' | 'failed' | 'lockout' | 'unavailable' | 'no_secret' | 'invalid';

export interface BiometricPluginInterface {
  check(): Promise<BiometricCheck>;
  /** Shows the system fingerprint/face prompt; resolves only on success. */
  authenticate(options: PromptOptions): Promise<void>;
  /** Keeps `secret` (base64) encrypted under an Android Keystore key (the Keychain on iOS), for retrieveSecret. */
  storeSecret(options: { secret: string }): Promise<void>;
  /** Shows the prompt and, on success, hands back the stored secret (base64). */
  retrieveSecret(options: PromptOptions): Promise<{ secret: string }>;
  clearSecret(): Promise<void>;
}

class BiometricPluginWeb extends WebPlugin implements BiometricPluginInterface {
  async check(): Promise<BiometricCheck> {
    return { available: false, reason: 'no_hardware', type: 'none' };
  }
  async authenticate(): Promise<void> {
    throw this.unavailable('Biometrics are only available in the Android app.');
  }
  async storeSecret(): Promise<void> {
    throw this.unavailable('Biometrics are only available in the Android app.');
  }
  async retrieveSecret(): Promise<{ secret: string }> {
    throw this.unavailable('Biometrics are only available in the Android app.');
  }
  async clearSecret(): Promise<void> {}
}

export const BiometricPlugin = registerPlugin<BiometricPluginInterface>('BiometricPlugin', {
  web: () => new BiometricPluginWeb(),
});

export function biometricErrorCode(err: unknown): BiometricErrorCode | undefined {
  return (err as { code?: BiometricErrorCode } | null)?.code;
}

/** What to call the phone's biometrics in copy, from what hardware it reports. */
export function biometricLabel(type: BiometryType | undefined): string {
  switch (type) {
    case 'fingerprint':
      return 'Fingerprint';
    case 'face':
      return 'Face unlock';
    case 'iris':
      return 'Iris unlock';
    default:
      return 'Fingerprint or face';
  }
}

/** One line explaining why the biometric toggle can't be turned on. */
export function biometricUnavailableReason(check: BiometricCheck | null): string {
  if (!check) return 'Checking what this phone supports…';
  switch (check.reason) {
    case 'none_enrolled':
      return 'No fingerprint or face is set up on this phone yet. Add one in the phone’s Settings first.';
    case 'no_hardware':
      return 'This phone has no fingerprint or face unlock.';
    default:
      return 'Fingerprint and face unlock aren’t available right now.';
  }
}
