import { storageGet, StorageKeys } from '../storage/db';

/* App-wide display formats chosen in Desk > Settings > Time & Formats. Read straight from storage
   (not through SettingsContext) so plain helpers and non-React code can honor them too. Each
   default is whatever the app did before the setting existed, so an untouched install looks the
   same as it always has. */

export type DateFormat = 'MDY' | 'DMY' | 'YMD';
export type FirstDayOfWeek = 'sun' | 'mon';
export type MeasurementSystem = 'metric' | 'imperial';

export function isClock24h(): boolean {
  return storageGet(StorageKeys.clockFormat24h, false);
}

/** "7:05 AM" or, with the 24-hour clock on, "07:05". */
export function formatClock(hour: number, minute: number): string {
  const mm = String(minute).padStart(2, '0');
  if (isClock24h()) return `${String(hour).padStart(2, '0')}:${mm}`;
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${mm} ${period}`;
}

/** Same as formatClock, for a Date -- optionally shown in another time zone. */
export function formatClockDate(date: Date, timeZone?: string): string {
  const tz = timeZone ? { timeZone } : {};
  if (isClock24h()) {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...tz });
  }
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, ...tz });
}

export function getDateFormat(): DateFormat {
  return storageGet<DateFormat>(StorageKeys.dateFormat, 'DMY');
}

/** Numeric date in the chosen order: 31/12/2026, 12/31/2026 or 2026-12-31. */
export function formatNumericDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  switch (getDateFormat()) {
    case 'MDY':
      return `${m}/${d}/${y}`;
    case 'YMD':
      return `${y}-${m}-${d}`;
    default:
      return `${d}/${m}/${y}`;
  }
}

export function getFirstDayOfWeek(): FirstDayOfWeek {
  return storageGet<FirstDayOfWeek>(StorageKeys.firstDayOfWeek, 'mon');
}

export function getMeasurementSystem(): MeasurementSystem {
  return storageGet<MeasurementSystem>(StorageKeys.measurementSystem, 'metric');
}
