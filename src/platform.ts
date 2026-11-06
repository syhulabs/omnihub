import { Capacitor } from '@capacitor/core';

/** The native shell this build runs in. Android-only features (ringtones, flash alerts, system
 *  panels, the alarm sound picker) check this so iOS never shows a control that can't work there. */
export const platform = Capacitor.getPlatform() as 'android' | 'ios' | 'web';
export const isIOS = platform === 'ios';
export const isAndroid = platform === 'android';
