import { formatClockDate } from '../../settings/formats';

export function getOffsetMinutes(timeZone: string, date: Date): number {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
  return (tzDate.getTime() - utcDate.getTime()) / 60000;
}

/** "-12 hours" / "+1 hour" / "-2h 30m" / "Same time" — matches the World Clock row style. */
export function formatWorldClockDiff(cityTimeZone: string, now: Date): string {
  const localOffset = -now.getTimezoneOffset();
  const cityOffset = getOffsetMinutes(cityTimeZone, now);
  const diff = Math.round(cityOffset - localOffset);
  if (diff === 0) return 'Same time';
  const hours = Math.floor(Math.abs(diff) / 60);
  const mins = Math.abs(diff) % 60;
  const sign = diff > 0 ? '+' : '-';
  if (mins === 0) return `${sign}${hours} hour${hours === 1 ? '' : 's'}`;
  return `${sign}${hours}h ${mins}m`;
}

/** "GMT+8 (MYT)" style label — the numeric offset is always accurate; the letter
 * abbreviation comes from Intl and is only appended when it adds real information. */
export function formatZoneLabel(timeZone: string, now: Date): string {
  const offset = getOffsetMinutes(timeZone, now);
  const sign = offset >= 0 ? '+' : '-';
  const hours = Math.floor(Math.abs(offset) / 60);
  const mins = Math.abs(offset) % 60;
  const gmt = `GMT${sign}${hours}${mins ? ':' + String(mins).padStart(2, '0') : ''}`;
  let abbr = '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(now);
    abbr = parts.find((p) => p.type === 'timeZoneName')?.value ?? '';
  } catch {
    abbr = '';
  }
  if (!abbr || /^GMT[+-]/.test(abbr) || abbr === 'UTC') return gmt;
  return `${gmt} (${abbr})`;
}

/** Whole-hour offset used only for sorting cities west-to-east. */
export function offsetHoursForSort(timeZone: string, now: Date): number {
  return getOffsetMinutes(timeZone, now) / 60;
}

/** null when same calendar day as local; otherwise "Yesterday" / "Tomorrow" / "+2d" / "-2d". */
export function dayOffsetLabel(timeZone: string, at: Date): string | null {
  const localYMD = at.toLocaleDateString('en-CA');
  const cityYMD = at.toLocaleDateString('en-CA', { timeZone });
  if (localYMD === cityYMD) return null;
  const diffDays = Math.round((new Date(`${cityYMD}T00:00:00`).getTime() - new Date(`${localYMD}T00:00:00`).getTime()) / 86400000);
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return diffDays > 0 ? `+${diffDays}d` : `${diffDays}d`;
}

export type DayPeriod = 'sunrise' | 'sun' | 'sunset' | 'moon';

/** A rough sun/moon icon for a city's current local hour — not real sunrise/sunset data. */
export function dayPeriod(timeZone: string, at: Date): DayPeriod {
  const raw = Number(at.toLocaleString('en-US', { timeZone, hour: 'numeric', hour12: false }));
  const hour = raw === 24 ? 0 : raw;
  if (hour >= 6 && hour < 8) return 'sunrise';
  if (hour >= 8 && hour < 18) return 'sun';
  if (hour >= 18 && hour < 20) return 'sunset';
  return 'moon';
}

export function hourInZone(timeZone: string, at: Date): number {
  const raw = Number(at.toLocaleString('en-US', { timeZone, hour: 'numeric', hour12: false }));
  return raw === 24 ? 0 : raw;
}

/** The real instant that is `hour`:00 wall-clock time in `timeZone`, on the same calendar day (in that zone) as `baseDate`. */
export function instantAtHourInZone(timeZone: string, hour: number, baseDate: Date): Date {
  const ymd = baseDate.toLocaleDateString('en-CA', { timeZone });
  const [y, m, d] = ymd.split('-').map(Number);
  const offsetMinutes = getOffsetMinutes(timeZone, baseDate);
  return new Date(Date.UTC(y, m - 1, d, hour, 0, 0) - offsetMinutes * 60000);
}

/** "3:16 pm" — lowercase am/pm to match the reference styling ("15:16" with the 24-hour clock on). */
export function formatTimeLower(date: Date, timeZone?: string): string {
  return formatClockDate(date, timeZone).replace(/(AM|PM)/i, (m) => m.toLowerCase());
}

/** "Wed, 23 September 2026" — day-before-month, which no built-in en-US format gives directly. */
export function formatFullDate(date: Date, timeZone?: string): string {
  const opts = timeZone ? { timeZone } : {};
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short', ...opts });
  const day = date.toLocaleDateString('en-US', { day: 'numeric', ...opts });
  const month = date.toLocaleDateString('en-US', { month: 'long', ...opts });
  const year = date.toLocaleDateString('en-US', { year: 'numeric', ...opts });
  return `${weekday}, ${day} ${month} ${year}`;
}

/** Falls back from an unrecognized IANA zone string to a readable city-ish name, e.g. "Asia/Kuala_Lumpur" -> "Kuala Lumpur". */
export function friendlyZoneName(timeZone: string): string {
  const last = timeZone.split('/').pop() ?? timeZone;
  return last.replace(/_/g, ' ');
}
