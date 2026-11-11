import { useMemo, useState } from 'react';
import { useBackHandler } from '../../app/useBackHandler';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon, type IconName } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';
import { hapticSelect, hapticTap } from '../../haptics';
import './PercentageCalculator.css';

type Mode = 'of' | 'isWhatPercent' | 'change';

interface HistoryEntry {
  id: string;
  mode: Mode;
  a: number;
  b: number;
  result: number;
}

const MODES: { id: Mode; label: string; subtitle: string; icon: IconName; color: string }[] = [
  { id: 'of', label: 'X% of Y', subtitle: 'Find a percentage of a number', icon: 'percent', color: 'var(--blue)' },
  {
    id: 'isWhatPercent',
    label: 'X is what % of Y',
    subtitle: 'Find percentage (X out of Y)',
    icon: 'pie-chart',
    color: 'var(--purple)',
  },
  {
    id: 'change',
    label: '% Change',
    subtitle: 'Find percentage increase or decrease',
    icon: 'trending-up',
    color: 'var(--green)',
  },
];

const PRESET_PERCENTS = [10, 25, 50, 75, 100];
const EXAMPLES: { mode: Mode; a: number; b: number }[] = [
  { mode: 'of', a: 10, b: 200 },
  { mode: 'of', a: 25, b: 80 },
  { mode: 'of', a: 50, b: 150 },
  { mode: 'of', a: 12.5, b: 320 },
];

const MAX_HISTORY = 20;

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  // Two decimals for ordinary results; small ones keep their leading digits instead of showing 0
  // (0.05% of 5 is 0.0025, not 0).
  if (n !== 0 && Math.abs(n) < 0.01) return n.toLocaleString(undefined, { maximumSignificantDigits: 3 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function compute(mode: Mode, a: number, b: number): number | null {
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  if (mode === 'of') return (a / 100) * b;
  if (mode === 'isWhatPercent') return b === 0 ? null : (a / b) * 100;
  if (a === 0) return null;
  // Relative to the size of the starting value: going from -50 to 50 is a rise (+200%), and
  // dividing by a negative start reported it as a fall.
  return ((b - a) / Math.abs(a)) * 100;
}

export function PercentageCalculator() {
  const { back } = useRouter();
  const [mode, setMode] = useState<Mode>('of');
  const [aText, setAText] = useState('');
  const [bText, setBText] = useState('');
  const [computed, setComputed] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Hardware back closes an open sheet or panel instead of leaving the tool.
  useBackHandler(() => setShowHistory(false), showHistory);
  const [history, setHistory] = useState<HistoryEntry[]>(() => storageGet(StorageKeys.percentageHistory, []));

  const a = parseFloat(aText);
  const b = parseFloat(bText);

  const liveResult = useMemo(() => compute(mode, a, b), [mode, a, b]);

  const modeInfo = MODES.find((m) => m.id === mode)!;

  const labels =
    mode === 'of'
      ? { a: 'Percent (%)', b: 'Of Value' }
      : mode === 'isWhatPercent'
        ? { a: 'This Value', b: 'Out Of' }
        : { a: 'From Value', b: 'To Value' };

  const resultLabel = mode === 'of' ? 'Result' : mode === 'isWhatPercent' ? 'Percentage' : 'Change';

  function saveHistory(entry: HistoryEntry) {
    const next = [entry, ...history].slice(0, MAX_HISTORY);
    setHistory(next);
    storageSet(StorageKeys.percentageHistory, next);
  }

  function clearHistory() {
    setHistory([]);
    storageSet(StorageKeys.percentageHistory, []);
  }

  function calculate() {
    hapticTap();
    const result = compute(mode, a, b);
    setComputed(result);
    if (result !== null) {
      saveHistory({ id: `${Date.now()}`, mode, a, b, result });
    }
  }

  function applyExample(ex: (typeof EXAMPLES)[number]) {
    hapticSelect();
    setMode(ex.mode);
    setAText(String(ex.a));
    setBText(String(ex.b));
    setComputed(compute(ex.mode, ex.a, ex.b));
  }

  function applyHistoryEntry(entry: HistoryEntry) {
    hapticSelect();
    setMode(entry.mode);
    setAText(String(entry.a));
    setBText(String(entry.b));
    setComputed(entry.result);
    setShowHistory(false);
  }

  return (
    <div className="screen">
      <ScreenHeader
        title="Percentage Calculator"
        subtitle="Calculate percentages easily"
        onBack={back}
        action={
          <button
            type="button"
            className="pc__header-btn"
            onClick={() => setShowHistory((v) => !v)}
            aria-label="Toggle history"
          >
            <Icon name={showHistory ? 'x' : 'history'} size={19} />
          </button>
        }
      />

      {showHistory ? (
        <div className="pc__history">
          {history.length === 0 ? (
            <p className="pc__history-empty">No calculations yet.</p>
          ) : (
            <>
              <ul className="pc__history-list">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button type="button" className="pc__history-item" onClick={() => applyHistoryEntry(entry)}>
                      <span className="pc__history-expr">
                        {entry.mode === 'of'
                          ? `${entry.a}% of ${entry.b}`
                          : entry.mode === 'isWhatPercent'
                            ? `${entry.a} out of ${entry.b}`
                            : `${entry.a} → ${entry.b}`}
                      </span>
                      <span className="pc__history-result">
                        {formatNumber(entry.result)}
                        {entry.mode !== 'of' ? '%' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="pc__clear-history" onClick={clearHistory}>
                Clear History
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="pc__body">
          <div className="pc__mode-row">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`pc__mode-card${mode === m.id ? ' pc__mode-card--active' : ''}`}
                style={{ '--mode-color': m.color } as React.CSSProperties}
                onClick={() => {
                  hapticSelect();
                  setMode(m.id);
                  setComputed(null);
                }}
              >
                <span className="pc__mode-icon">
                  <Icon name={m.icon} size={18} />
                </span>
                <strong>{m.label}</strong>
                <span>{m.subtitle}</span>
              </button>
            ))}
          </div>

          <div className="pc__panel">
            <div className="pc__panel-header">
              <span className="pc__panel-icon" style={{ '--mode-color': modeInfo.color } as React.CSSProperties}>
                <Icon name={modeInfo.icon} size={18} />
              </span>
              <div>
                <strong>{modeInfo.label}</strong>
                <span>{modeInfo.subtitle}</span>
              </div>
            </div>

            <div className="pc__field-row">
              <span className="pc__field-icon pc__field-icon--blue">
                <Icon name={mode === 'of' ? 'percent' : 'hash'} size={16} />
              </span>
              <div className="pc__field">
                <label className="pc__label">{labels.a}</label>
                <input
                  className="pc__input"
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={aText}
                  onChange={(e) => {
                    setAText(e.target.value);
                    setComputed(null);
                  }}
                />
              </div>
              {mode === 'of' && <span className="pc__field-suffix">%</span>}
            </div>

            <div className="pc__field-row">
              <span className="pc__field-icon pc__field-icon--purple">
                <Icon name="hash" size={16} />
              </span>
              <div className="pc__field">
                <label className="pc__label">{labels.b}</label>
                <input
                  className="pc__input"
                  type="number"
                  inputMode="decimal"
                  placeholder="0"
                  value={bText}
                  onChange={(e) => {
                    setBText(e.target.value);
                    setComputed(null);
                  }}
                />
              </div>
            </div>

            {mode === 'of' && (
              <div className="pc__preset-row">
                {PRESET_PERCENTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`pc__preset-chip${aText === String(p) ? ' pc__preset-chip--active' : ''}`}
                    onClick={() => {
                      hapticSelect();
                      setAText(String(p));
                      setComputed(null);
                    }}
                  >
                    {p}%
                  </button>
                ))}
              </div>
            )}

            <button type="button" className="pc__calculate" onClick={calculate} disabled={liveResult === null}>
              <Icon name="calculator" size={18} />
              Calculate
            </button>
          </div>

          <div className="pc__result">
            <div className="pc__result-header">
              <span className="pc__result-icon">
                <Icon name="trending-up" size={18} />
              </span>
              <div>
                <strong>{resultLabel}</strong>
                <span>{computed === null ? 'The calculated value will appear here' : 'Based on your inputs'}</span>
              </div>
            </div>
            <div className="pc__result-value-row">
              {computed === null ? (
                <span className="pc__result-placeholder" />
              ) : (
                <span className="pc__result-value">
                  {formatNumber(computed)}
                  {mode === 'of' ? '' : '%'}
                </span>
              )}
            </div>
          </div>

          <div className="pc__examples">
            <div className="pc__examples-header">
              <span className="pc__examples-icon">
                <Icon name="lightbulb" size={18} />
              </span>
              <div>
                <strong>Examples</strong>
                <span>Tap an example to try it</span>
              </div>
            </div>
            <div className="pc__examples-grid">
              {EXAMPLES.map((ex) => {
                const r = compute(ex.mode, ex.a, ex.b);
                return (
                  <button
                    key={`${ex.a}-${ex.b}`}
                    type="button"
                    className="pc__example-chip"
                    onClick={() => applyExample(ex)}
                  >
                    <span>
                      {ex.a}% of {ex.b}
                    </span>
                    <strong>= {r === null ? '—' : formatNumber(r)}</strong>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
