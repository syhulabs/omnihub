import { useEffect, useRef, useState } from 'react';
import { formatClock, pad, playBeep } from './time';
import { hapticSuccess, hapticTap } from '../../haptics';
import { Icon, type IconName } from '../../components/Icon';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useRouter } from '../../app/Router';
import { useBackHandler } from '../../app/useBackHandler';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';

type Status = 'idle' | 'running' | 'paused' | 'finished';

interface TimerHistoryEntry {
  id: string;
  durationMs: number;
  label: string | null;
  completedAt: number;
}

interface Preset {
  label: string;
  minutes: number;
  icon: IconName;
  color: string;
}

const PRESETS: Preset[] = [
  { label: 'Break', minutes: 5, icon: 'mug', color: 'var(--green)' },
  { label: 'Workout', minutes: 10, icon: 'run', color: 'var(--blue)' },
  { label: 'Cooking', minutes: 15, icon: 'pot', color: 'var(--orange)' },
  { label: 'Sleep', minutes: 30, icon: 'moon', color: 'var(--purple)' },
];

const MAX_HISTORY = 20;
const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;

interface SavedTimerState {
  status: Status;
  remainingAtPause: number;
  startedAt: number | null;
  hoursInput: string;
  minutesInput: string;
  secondsInput: string;
}

/** A running or paused timer survives leaving the screen: its wall-clock anchor is stored and
 *  the remaining time is recomputed on return. A timer that ran out while away comes back as
 *  finished (the beep already happened, or couldn't, while the screen was closed). */
function loadSavedTimer(): SavedTimerState {
  const fallback: SavedTimerState = {
    status: 'idle',
    remainingAtPause: 0,
    startedAt: null,
    hoursInput: '0',
    minutesInput: '5',
    secondsInput: '0',
  };
  const saved = storageGet<SavedTimerState | null>(StorageKeys.timerState, null);
  if (!saved) return fallback;
  if (saved.status === 'running' && saved.startedAt !== null) {
    const remaining = saved.remainingAtPause - (Date.now() - saved.startedAt);
    if (remaining <= 0) return { ...saved, status: 'finished', remainingAtPause: 0, startedAt: null };
  }
  return { ...fallback, ...saved };
}

export function TimerView() {
  const { back } = useRouter();
  const savedRef = useRef<SavedTimerState | null>(null);
  if (savedRef.current === null) savedRef.current = loadSavedTimer();
  const saved = savedRef.current;
  const [hoursInput, setHoursInput] = useState(saved.hoursInput);
  const [minutesInput, setMinutesInput] = useState(saved.minutesInput);
  const [secondsInput, setSecondsInput] = useState(saved.secondsInput);

  const [status, setStatus] = useState<Status>(saved.status);
  const [remainingAtPause, setRemainingAtPause] = useState(saved.remainingAtPause);
  const [startedAt, setStartedAt] = useState<number | null>(saved.startedAt);
  const [, forceTick] = useState(0);
  const beepedRef = useRef(saved.status === 'finished');

  useEffect(() => {
    storageSet(StorageKeys.timerState, {
      status,
      remainingAtPause,
      startedAt,
      hoursInput,
      minutesInput,
      secondsInput,
    } satisfies SavedTimerState);
  }, [status, remainingAtPause, startedAt, hoursInput, minutesInput, secondsInput]);

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<TimerHistoryEntry[]>(() =>
    storageGet(StorageKeys.timerHistory, []),
  );

  useBackHandler(() => setShowHistory(false), showHistory);

  const setDurationMs =
    (Math.max(0, parseInt(hoursInput || '0', 10)) * 3600 +
      Math.max(0, parseInt(minutesInput || '0', 10)) * 60 +
      Math.max(0, parseInt(secondsInput || '0', 10))) *
    1000;

  const remaining =
    status === 'running' && startedAt
      ? Math.max(0, remainingAtPause - (Date.now() - startedAt))
      : status === 'idle'
        ? setDurationMs
        : remainingAtPause;

  useEffect(() => {
    if (status !== 'running') return;
    const interval = setInterval(() => forceTick((t) => t + 1), 200);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (status === 'running' && remaining <= 0 && !beepedRef.current) {
      beepedRef.current = true;
      setStatus('finished');
      setRemainingAtPause(0);
      playBeep();
      hapticSuccess();
      logHistory(setDurationMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, remaining]);

  function logHistory(durationMs: number) {
    const matched = PRESETS.find(
      (p) => p.minutes * 60000 === durationMs && parseInt(hoursInput || '0', 10) === 0,
    );
    const entry: TimerHistoryEntry = {
      id: `${Date.now()}`,
      durationMs,
      label: matched?.label ?? null,
      completedAt: Date.now(),
    };
    const next = [entry, ...history].slice(0, MAX_HISTORY);
    setHistory(next);
    storageSet(StorageKeys.timerHistory, next);
  }

  function clearHistory() {
    setHistory([]);
    storageSet(StorageKeys.timerHistory, []);
  }

  function fillFromMs(ms: number) {
    const totalSec = Math.round(ms / 1000);
    setHoursInput(pad(Math.floor(totalSec / 3600)));
    setMinutesInput(pad(Math.floor((totalSec % 3600) / 60)));
    setSecondsInput(pad(totalSec % 60));
  }

  function applyHistoryEntry(entry: TimerHistoryEntry) {
    reset();
    fillFromMs(entry.durationMs);
    setShowHistory(false);
  }

  function start() {
    beepedRef.current = false;
    setRemainingAtPause(setDurationMs);
    setStartedAt(Date.now());
    setStatus('running');
  }

  function pause() {
    setRemainingAtPause(remaining);
    setStartedAt(null);
    setStatus('paused');
  }

  function resume() {
    setStartedAt(Date.now());
    setStatus('running');
  }

  function reset() {
    beepedRef.current = false;
    setStatus('idle');
    setStartedAt(null);
    setRemainingAtPause(0);
  }

  const isEditing = status === 'idle';

  function adjust(setValue: (v: string) => void, current: string, delta: number, max: number) {
    if (!isEditing) return;
    const cur = parseInt(current || '0', 10);
    setValue(pad(Math.min(max, Math.max(0, cur + delta))));
    hapticTap();
  }

  function handleFieldChange(raw: string, max: number, setValue: (v: string) => void) {
    const num = parseInt(raw, 10);
    if (raw === '') setValue('');
    else if (!Number.isNaN(num)) setValue(pad(Math.min(Math.max(num, 0), max)));
  }

  function applyPreset(preset: Preset) {
    if (!isEditing) return;
    setHoursInput('00');
    setMinutesInput(pad(preset.minutes));
    setSecondsInput('00');
    hapticTap();
  }

  const ringFraction =
    status === 'idle'
      ? 1
      : status === 'finished'
        ? 0
        : setDurationMs > 0
          ? Math.min(1, Math.max(0, remaining / setDurationMs))
          : 0;

  const handleAngle = ringFraction * 2 * Math.PI;
  const handleX = 50 + RING_R * Math.sin(handleAngle);
  const handleY = 50 - RING_R * Math.cos(handleAngle);

  const hoursNum = parseInt(hoursInput || '0', 10);
  const showHours = hoursNum > 0;
  // Rounded up, as countdowns are read: a 5:00 timer shows 05:00 for its first second and 00:00
  // only when it is over (rounding down showed 04:59 at once and sat on 00:00 for a full second).
  const displayTotalSec = Math.max(0, Math.ceil(remaining / 1000));
  const dispH = pad(Math.floor(displayTotalSec / 3600));
  const dispM = pad(Math.floor((displayTotalSec % 3600) / 60));
  const dispS = pad(displayTotalSec % 60);

  return (
    <div className="screen">
      <ScreenHeader
        title="Timer"
        subtitle="Set a time and stay focused"
        onBack={back}
        action={
          <button
            type="button"
            className="tm2__header-btn"
            onClick={() => setShowHistory((v) => !v)}
            aria-label="Toggle timer history"
          >
            <Icon name={showHistory ? 'x' : 'history'} size={19} />
          </button>
        }
      />

      {showHistory ? (
        <div className="tm2__history">
          {history.length === 0 ? (
            <p className="tm2__history-empty">No timers completed yet.</p>
          ) : (
            <>
              <ul className="tm2__history-list">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="tm2__history-item"
                      onClick={() => applyHistoryEntry(entry)}
                    >
                      <span className="tm2__history-icon">
                        <Icon name={PRESETS.find((p) => p.label === entry.label)?.icon ?? 'timer'} size={17} />
                      </span>
                      <span className="tm2__history-info">
                        <span className="tm2__history-duration">
                          {formatClock(entry.durationMs, entry.durationMs >= 3600000)}
                        </span>
                        <span className="tm2__history-label">{entry.label ?? 'Custom'}</span>
                      </span>
                      <span className="tm2__history-ago">{timeAgo(entry.completedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="tm2__clear-history" onClick={clearHistory}>
                Clear History
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="tm2">
          <div className="tm2__ring-wrap">
            <svg className="tm2__ring" viewBox="0 0 100 100">
              <circle className="tm2__ring-track" cx="50" cy="50" r={RING_R} />
              <circle
                className={`tm2__ring-progress${status === 'finished' ? ' tm2__ring-progress--finished' : ''}`}
                cx="50"
                cy="50"
                r={RING_R}
                style={{
                  strokeDasharray: RING_C,
                  strokeDashoffset: RING_C * (1 - ringFraction),
                }}
              />
            </svg>
            {status !== 'idle' && (
              <span
                className={`tm2__ring-handle${status === 'finished' ? ' tm2__ring-handle--finished' : ''}`}
                style={{ left: `${handleX}%`, top: `${handleY}%` }}
              />
            )}

            <div className="tm2__ring-center">
              {isEditing ? (
                <div className="tm2__display">
                  <span>{hoursInput.padStart(2, '0')}</span>
                  <span className="tm2__colon">:</span>
                  <span className="tm2__display--accent">{minutesInput.padStart(2, '0')}</span>
                  <span className="tm2__colon">:</span>
                  <span>{secondsInput.padStart(2, '0')}</span>
                </div>
              ) : (
                <div className={`tm2__display${status === 'finished' ? ' tm2__display--finished' : ''}`}>
                  {showHours && (
                    <>
                      <span>{dispH}</span>
                      <span className="tm2__colon">:</span>
                    </>
                  )}
                  <span className="tm2__display--accent">{dispM}</span>
                  <span className="tm2__colon">:</span>
                  <span>{dispS}</span>
                </div>
              )}
              {!isEditing && (
                <div className="tm2__unit-row">
                  {showHours && <span>HR</span>}
                  <span>MIN</span>
                  <span>SEC</span>
                </div>
              )}
            </div>
          </div>

          {status === 'finished' && <p className="tm2__finished-label">Time's up!</p>}

          {isEditing && (
            <div className="tm2__steppers">
              <Stepper
                label="HR"
                value={hoursInput}
                onInc={() => adjust(setHoursInput, hoursInput, 1, 99)}
                onDec={() => adjust(setHoursInput, hoursInput, -1, 99)}
                onChange={(v) => handleFieldChange(v, 99, setHoursInput)}
                onBlur={() => hoursInput === '' && setHoursInput('0')}
              />
              <Stepper
                label="MIN"
                value={minutesInput}
                onInc={() => adjust(setMinutesInput, minutesInput, 1, 59)}
                onDec={() => adjust(setMinutesInput, minutesInput, -1, 59)}
                onChange={(v) => handleFieldChange(v, 59, setMinutesInput)}
                onBlur={() => minutesInput === '' && setMinutesInput('0')}
              />
              <Stepper
                label="SEC"
                value={secondsInput}
                onInc={() => adjust(setSecondsInput, secondsInput, 1, 59)}
                onDec={() => adjust(setSecondsInput, secondsInput, -1, 59)}
                onChange={(v) => handleFieldChange(v, 59, setSecondsInput)}
                onBlur={() => secondsInput === '' && setSecondsInput('0')}
              />
            </div>
          )}

          <div className="tm__controls">
            {status === 'idle' && (
              <button
                type="button"
                className="tm__btn tm__btn--start tm2__start-btn"
                onClick={start}
                disabled={setDurationMs <= 0}
              >
                <Icon name="play" size={18} />
                Start
              </button>
            )}
            {status === 'running' && (
              <>
                <button type="button" className="tm__btn tm__btn--secondary" onClick={reset}>
                  Reset
                </button>
                <button type="button" className="tm__btn tm__btn--stop" onClick={pause}>
                  Pause
                </button>
              </>
            )}
            {status === 'paused' && (
              <>
                <button type="button" className="tm__btn tm__btn--secondary" onClick={reset}>
                  Reset
                </button>
                <button type="button" className="tm__btn tm__btn--start" onClick={resume}>
                  Resume
                </button>
              </>
            )}
            {status === 'finished' && (
              <button type="button" className="tm__btn tm__btn--start" onClick={reset}>
                Reset
              </button>
            )}
          </div>

          {isEditing && (
            <div className="tm2__presets">
              {PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  className="tm2__preset"
                  style={{ '--preset-color': preset.color } as React.CSSProperties}
                  onClick={() => applyPreset(preset)}
                >
                  <span className="tm2__preset-icon">
                    <Icon name={preset.icon} size={18} />
                  </span>
                  <strong>{preset.minutes} min</strong>
                  <span className="tm2__preset-label">{preset.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stepper({
  label,
  value,
  onInc,
  onDec,
  onChange,
  onBlur,
}: {
  label: string;
  value: string;
  onInc: () => void;
  onDec: () => void;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="tm2__stepper">
      <button type="button" className="tm2__stepper-btn" onClick={onInc} aria-label={`Increase ${label}`}>
        <Icon name="plus" size={15} />
      </button>
      <input
        type="number"
        inputMode="numeric"
        className="tm2__stepper-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
      />
      <button type="button" className="tm2__stepper-btn" onClick={onDec} aria-label={`Decrease ${label}`}>
        <Icon name="minus" size={15} />
      </button>
      <span className="tm2__stepper-label">{label}</span>
    </div>
  );
}

function timeAgo(ts: number): string {
  const diffMin = Math.floor((Date.now() - ts) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}
