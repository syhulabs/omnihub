import { useEffect, useRef, useState } from 'react';
import { formatStopwatch, pad } from './time';
import { Icon } from '../../components/Icon';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useRouter } from '../../app/Router';
import { useBackHandler } from '../../app/useBackHandler';
import { hapticTap } from '../../haptics';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';

interface Lap {
  id: string;
  lapMs: number;
  totalMs: number;
}

interface StopwatchHistoryEntry {
  id: string;
  elapsedMs: number;
  lapCount: number;
  completedAt: number;
}

const MAX_HISTORY = 20;
const RING_R = 44;
const RING_C = 2 * Math.PI * RING_R;
const TICKS = Array.from({ length: 12 }, (_, i) => i * 30);

interface SavedStopwatchState {
  running: boolean;
  accumulated: number;
  startedAt: number | null;
  laps: Lap[];
  lastLapTotal: number;
}

const EMPTY_STOPWATCH: SavedStopwatchState = { running: false, accumulated: 0, startedAt: null, laps: [], lastLapTotal: 0 };

export function StopwatchView() {
  const { back } = useRouter();
  // A running stopwatch keeps counting while the user is elsewhere in the app: only its
  // wall-clock start is stored, so time away is counted exactly.
  const savedRef = useRef<SavedStopwatchState | null>(null);
  if (savedRef.current === null) {
    savedRef.current = { ...EMPTY_STOPWATCH, ...storageGet<Partial<SavedStopwatchState>>(StorageKeys.stopwatchState, {}) };
  }
  const saved = savedRef.current;
  const [running, setRunning] = useState(saved.running && saved.startedAt !== null);
  const [accumulated, setAccumulated] = useState(saved.accumulated);
  const [startedAt, setStartedAt] = useState<number | null>(saved.startedAt);
  const [, forceTick] = useState(0);
  const [laps, setLaps] = useState<Lap[]>(saved.laps);
  const lastLapTotalRef = useRef(saved.lastLapTotal);

  useEffect(() => {
    storageSet(StorageKeys.stopwatchState, {
      running,
      accumulated,
      startedAt,
      laps,
      lastLapTotal: lastLapTotalRef.current,
    } satisfies SavedStopwatchState);
  }, [running, accumulated, startedAt, laps]);

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<StopwatchHistoryEntry[]>(() =>
    storageGet(StorageKeys.stopwatchHistory, []),
  );

  useBackHandler(() => setShowHistory(false), showHistory);

  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => forceTick((t) => t + 1), 31);
    return () => clearInterval(interval);
  }, [running]);

  const elapsed = accumulated + (running && startedAt ? Date.now() - startedAt : 0);

  function start() {
    setStartedAt(Date.now());
    setRunning(true);
  }

  function stop() {
    if (startedAt) setAccumulated((a) => a + (Date.now() - startedAt));
    setStartedAt(null);
    setRunning(false);
  }

  function reset() {
    if (elapsed > 0) {
      const entry: StopwatchHistoryEntry = {
        id: `${Date.now()}`,
        elapsedMs: elapsed,
        lapCount: laps.length,
        completedAt: Date.now(),
      };
      const next = [entry, ...history].slice(0, MAX_HISTORY);
      setHistory(next);
      storageSet(StorageKeys.stopwatchHistory, next);
    }
    setRunning(false);
    setStartedAt(null);
    setAccumulated(0);
    setLaps([]);
    lastLapTotalRef.current = 0;
  }

  function clearHistory() {
    setHistory([]);
    storageSet(StorageKeys.stopwatchHistory, []);
  }

  function addLap() {
    hapticTap();
    const total = elapsed;
    const lap: Lap = {
      id: `${Date.now()}`,
      lapMs: total - lastLapTotalRef.current,
      totalMs: total,
    };
    lastLapTotalRef.current = total;
    setLaps((prev) => [lap, ...prev]);
  }

  const cycleFraction = elapsed === 0 ? 1 : (elapsed % 60000) / 60000;
  const handleAngle = cycleFraction * 2 * Math.PI;
  const handleX = 50 + RING_R * Math.sin(handleAngle);
  const handleY = 50 - RING_R * Math.cos(handleAngle);

  const totalSec = Math.floor(elapsed / 1000);
  const hours = Math.floor(totalSec / 3600);
  const showHours = hours > 0;

  return (
    <div className="screen">
      <ScreenHeader
        title="Stopwatch"
        subtitle="Track time, beat your best"
        onBack={back}
        action={
          <button
            type="button"
            className="tm2__header-btn"
            onClick={() => setShowHistory((v) => !v)}
            aria-label="Toggle stopwatch history"
          >
            <Icon name={showHistory ? 'x' : 'history'} size={19} />
          </button>
        }
      />

      {showHistory ? (
        <div className="tm2__history">
          {history.length === 0 ? (
            <p className="tm2__history-empty">No stopwatch runs yet.</p>
          ) : (
            <>
              <ul className="tm2__history-list">
                {history.map((entry) => (
                  <li key={entry.id} className="tm2__history-item">
                    <span className="tm2__history-icon">
                      <Icon name="timer" size={17} />
                    </span>
                    <span className="tm2__history-info">
                      <span className="tm2__history-duration">{formatStopwatch(entry.elapsedMs)}</span>
                      <span className="tm2__history-label">
                        {entry.lapCount > 0 ? `${entry.lapCount} lap${entry.lapCount === 1 ? '' : 's'}` : 'No laps'}
                      </span>
                    </span>
                    <span className="tm2__history-ago">{timeAgo(entry.completedAt)}</span>
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
        <div className="sw2">
          <div className="sw2__ring-wrap">
            <svg className="sw2__ring" viewBox="0 0 100 100">
              {TICKS.map((deg) => {
                const rad = (deg * Math.PI) / 180;
                const x1 = 50 + 48 * Math.cos(rad);
                const y1 = 50 + 48 * Math.sin(rad);
                const x2 = 50 + 50 * Math.cos(rad);
                const y2 = 50 + 50 * Math.sin(rad);
                return <line key={deg} className="sw2__tick" x1={x1} y1={y1} x2={x2} y2={y2} />;
              })}
              <circle className="sw2__ring-track" cx="50" cy="50" r={RING_R} />
              <circle
                className="sw2__ring-progress"
                cx="50"
                cy="50"
                r={RING_R}
                style={{ strokeDasharray: RING_C, strokeDashoffset: RING_C * (1 - cycleFraction) }}
              />
            </svg>
            <span className="sw2__ring-handle" style={{ left: `${handleX}%`, top: `${handleY}%` }} />

            <div className="sw2__ring-center">
              <div className="sw2__display">
                {showHours && (
                  <>
                    <span>{pad(hours)}</span>
                    <span className="tm2__colon">:</span>
                  </>
                )}
                <span>{formatStopwatch(elapsed, showHours).split('.')[0]}</span>
                <span className="sw2__display--accent">.{formatStopwatch(elapsed, showHours).split('.')[1]}</span>
              </div>
              <div className="tm2__unit-row">
                {showHours && <span>HR</span>}
                <span>MIN</span>
                <span>SEC</span>
              </div>
            </div>
          </div>

          <div className="sw2__controls">
            <div className="sw2__control">
              <button
                type="button"
                className="sw2__circle-btn sw2__circle-btn--secondary"
                onClick={reset}
                disabled={running || elapsed === 0}
                aria-label="Reset"
              >
                <Icon name="repeat" size={20} />
              </button>
              <span>Reset</span>
            </div>
            <div className="sw2__control">
              <button
                type="button"
                className={`sw2__circle-btn sw2__circle-btn--main${running ? ' sw2__circle-btn--stop' : ''}`}
                onClick={running ? stop : start}
                aria-label={running ? 'Stop' : 'Start'}
              >
                <Icon name={running ? 'stop' : 'play'} size={26} />
              </button>
              <span>{running ? 'Stop' : 'Start'}</span>
            </div>
            <div className="sw2__control">
              <button
                type="button"
                className="sw2__circle-btn sw2__circle-btn--secondary"
                onClick={addLap}
                disabled={!running}
                aria-label="Lap"
              >
                <Icon name="flag" size={19} />
              </button>
              <span>Lap</span>
            </div>
          </div>

          <div className="sw2__laps-card">
            <div className="sw2__laps-header">
              <strong>Laps</strong>
              <span>{laps.length} lap{laps.length === 1 ? '' : 's'}</span>
            </div>
            {laps.length === 0 ? (
              <div className="sw2__laps-empty">
                <Icon name="timer" size={30} />
                <p>No laps yet</p>
                <span>Tap Lap to record your times</span>
              </div>
            ) : (
              <ul className="sw2__laps-list">
                {laps.map((lap, index) => (
                  <li key={lap.id} className="sw2__lap-row">
                    <span>Lap {laps.length - index}</span>
                    <span>{formatStopwatch(lap.lapMs)}</span>
                    <span className="sw2__lap-total">{formatStopwatch(lap.totalMs)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
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
