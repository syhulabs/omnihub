import { useEffect, useState } from 'react';
import { formatClock } from '../../settings/formats';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { hapticSelect } from '../../haptics';
import { SleepModePlugin, type SleepSession } from '../../sleep-mode/plugin';
import './SleepMode.css';

interface SleepInsightsProps {
  onBack: () => void;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function minutesOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

function formatTimeOfDay(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return formatClock(Math.floor(total / 60), total % 60);
}

/** Minutes of day re-based so that a night straddling midnight averages sensibly: 23:30 and 00:30
 *  become 1410 and 1470 (not 1410 and 30), so their average is midnight, not noon. */
function bedtimeMinutes(ms: number): number {
  const m = minutesOfDay(ms);
  return m < 720 ? m + 1440 : m;
}

/** Actual bedtime proxy: the last nag time if any (roughly "when you stopped scrolling"), else the scheduled bedtime. */
function actualBedtimeMillis(s: SleepSession): number {
  return s.lastNagMillis > 0 ? s.lastNagMillis : s.bedtimeScheduledMillis;
}

/** Signed minutes late vs. that session's own scheduled bedtime, wrap-safe around midnight. */
function minutesLate(s: SleepSession): number {
  const actual = minutesOfDay(actualBedtimeMillis(s));
  const scheduled = minutesOfDay(s.bedtimeScheduledMillis);
  let diff = actual - scheduled;
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  return diff;
}

export function SleepInsights({ onBack }: SleepInsightsProps) {
  const [sessions, setSessions] = useState<SleepSession[] | null>(null);
  const [range, setRange] = useState<'week' | 'month' | 'year'>('week');

  useEffect(() => {
    SleepModePlugin.getHistory()
      .then((r) => setSessions(r.sessions))
      .catch(() => setSessions([]));
  }, []);

  if (sessions === null) {
    return (
      <div className="screen">
        <ScreenHeader title="Sleep Insights" subtitle="Your real Sleep Mode history" onBack={onBack} />
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="screen">
        <ScreenHeader title="Sleep Insights" subtitle="Your real Sleep Mode history" onBack={onBack} />
        <div className="sm__body">
          <div className="sm__empty-state">
            <Icon name="trending-up" size={32} />
            <strong>No nights logged yet</strong>
            <span>Turn Sleep Mode on and use it for a few nights — real stats will show up here, never made up.</span>
          </div>
        </div>
      </div>
    );
  }

  const recent = sessions.slice(-14);
  const avgBedtimeMin = recent.reduce((sum, s) => sum + bedtimeMinutes(actualBedtimeMillis(s)), 0) / recent.length;
  const avgWakeMin = recent.reduce((sum, s) => sum + minutesOfDay(s.wakeScheduledMillis), 0) / recent.length;
  const onScheduleCount = recent.filter((s) => s.nagCount === 0).length;
  const avgSleepHours =
    recent.reduce((sum, s) => {
      let mins = minutesOfDay(s.wakeScheduledMillis) - minutesOfDay(actualBedtimeMillis(s));
      if (mins < 0) mins += 1440;
      return sum + mins;
    }, 0) /
    recent.length /
    60;

  const last7 = sessions.slice(-7);
  const maxLate = Math.max(30, ...last7.map((s) => Math.max(0, minutesLate(s))));

  return (
    <div className="screen">
      <ScreenHeader title="Sleep Insights" subtitle="Your real Sleep Mode history" onBack={onBack} />

      <div className="sm__body">
        <div className="si__range-tabs">
          {(['week', 'month', 'year'] as const).map((r) => (
            <button
              key={r}
              type="button"
              className={`si__range-tab${range === r ? ' si__range-tab--active' : ''}`}
              onClick={() => {
                hapticSelect();
                setRange(r);
              }}
            >
              {r === 'week' ? 'Week' : r === 'month' ? 'Month' : 'Year'}
            </button>
          ))}
        </div>
        {range !== 'week' && (
          <p className="sm__pro-note">Only enough history has built up for a Week view so far — check back after more nights.</p>
        )}

        <div className="si__stat-grid">
          <div className="si__stat-card">
            <Icon name="moon" size={16} />
            <strong>{formatTimeOfDay(avgBedtimeMin)}</strong>
            <span>Average bedtime</span>
          </div>
          <div className="si__stat-card">
            <Icon name="sun" size={16} />
            <strong>{formatTimeOfDay(avgWakeMin)}</strong>
            <span>Average wake time</span>
          </div>
        </div>

        <div className="si__chart-card">
          <div className="si__chart-head">
            <span>Minutes late vs. your scheduled bedtime</span>
            <span className="si__chart-target">Target: on time</span>
          </div>
          <div className="si__chart-bars">
            {last7.map((s, i) => {
              const late = Math.max(0, minutesLate(s));
              const height = Math.round((late / maxLate) * 100);
              const dayIndex = new Date(s.bedtimeScheduledMillis).getDay();
              const label = DAY_LABELS[(dayIndex + 6) % 7];
              return (
                <div key={i} className="si__bar-col">
                  <div className="si__bar" style={{ height: `${Math.max(4, height)}%` }} />
                  <span>{label}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="si__stat-grid">
          <div className="si__stat-card">
            <Icon name="clock" size={16} />
            <strong>{avgSleepHours.toFixed(1)}h</strong>
            <span>Avg. hours before wake</span>
          </div>
          <div className="si__stat-card">
            <Icon name="check" size={16} />
            <strong>{onScheduleCount}/{recent.length}</strong>
            <span>Nights on schedule</span>
          </div>
        </div>
      </div>
    </div>
  );
}
