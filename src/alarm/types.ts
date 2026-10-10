import { formatClock } from '../settings/formats';

export type RepeatMode = 'today' | 'daily' | 'weekend' | 'weekdays';

export type TimeCategory = 'morning' | 'afternoon' | 'evening' | 'night';

export interface AlarmPreset {
  hour: number;
  minute: number;
}

export type AlarmPresets = Record<TimeCategory, AlarmPreset[]>;

export const DEFAULT_PRESETS: AlarmPresets = {
  morning: [
    { hour: 5, minute: 0 },
    { hour: 6, minute: 0 },
    { hour: 7, minute: 0 },
    { hour: 8, minute: 0 },
  ],
  afternoon: [
    { hour: 12, minute: 0 },
    { hour: 13, minute: 0 },
    { hour: 14, minute: 0 },
  ],
  evening: [
    { hour: 16, minute: 0 },
    { hour: 17, minute: 0 },
    { hour: 18, minute: 0 },
  ],
  night: [
    { hour: 22, minute: 0 },
    { hour: 23, minute: 0 },
    { hour: 0, minute: 0 },
  ],
};

export const REPEAT_LABELS: Record<RepeatMode, string> = {
  today: 'Today',
  daily: 'Daily',
  weekend: 'Weekends',
  weekdays: 'Weekdays',
};

/** REPEAT_LABELS['today'] is only accurate if that hour/minute hasn't already passed today --
 *  e.g. picking 7:00 AM at 9 PM actually rings tomorrow. Every place that shows a one-time
 *  alarm's schedule label should call this instead of indexing REPEAT_LABELS directly. */
export function repeatLabelFor(mode: RepeatMode, hour: number, minute: number): string {
  if (mode !== 'today') return REPEAT_LABELS[mode];
  const now = new Date();
  const ringsTomorrow = hour * 60 + minute <= now.getHours() * 60 + now.getMinutes();
  return ringsTomorrow ? 'Tomorrow' : 'Today';
}

export function formatTime(hour: number, minute: number): string {
  return formatClock(hour, minute);
}
