import { AlarmPlugin } from '../alarm/plugin';
import { SleepModePlugin, DEFAULT_SLEEP_MODE_CONFIG } from '../sleep-mode/plugin';
import { FlashAlertPlugin } from '../flashalert/plugin';
import { BiometricPlugin } from '../biometric/plugin';
import { purgeSharedCache } from '../share/saveFile';

/** "Clear All Data" and "Delete My Account" promise a clean phone. Alarms, Sleep Mode and Flash
 *  Alerts live in native storage and AlarmManager, not localStorage, so they're cleared here;
 *  every step is best-effort so a missing plugin (web) can't stop the rest. */
export async function clearNativeState(): Promise<void> {
  try {
    const { alarms } = await AlarmPlugin.list();
    for (const alarm of alarms) {
      try {
        await AlarmPlugin.cancel({ id: alarm.id });
      } catch {
        // keep going; one stubborn alarm shouldn't leave the others armed
      }
    }
  } catch {
    // plugin unavailable
  }
  try {
    await SleepModePlugin.configure({ ...DEFAULT_SLEEP_MODE_CONFIG, enabled: false });
  } catch {
    // plugin unavailable
  }
  try {
    // The Vault key kept for fingerprint/face unlock (Keystore on Android; the iOS Keychain
    // entry would even outlive an uninstall).
    await BiometricPlugin.clearSecret();
  } catch {
    // plugin unavailable
  }
  try {
    await AlarmPlugin.clearCrashLog();
  } catch {
    // plugin unavailable
  }
  // Files handed to the share sheet earlier: decrypted Vault files, Vault zips, backups.
  await purgeSharedCache();
  try {
    await FlashAlertPlugin.setNotificationEnabled({ enabled: false });
    await FlashAlertPlugin.setCallEnabled({ enabled: false });
    await FlashAlertPlugin.setAlarmEnabled({ enabled: false });
  } catch {
    // plugin unavailable
  }
}
