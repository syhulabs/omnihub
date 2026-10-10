import { useEffect, useRef } from 'react';
import { hapticSelect } from '../../haptics';
import { isClock24h } from '../../settings/formats';
import './WheelTimePicker.css';

const ROW_HEIGHT = 44;
const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1);
const HOURS_24 = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

interface WheelTimePickerProps {
  hour: number;
  minute: number;
  onChange: (hour: number, minute: number) => void;
}

export function WheelTimePicker({ hour, minute, onChange }: WheelTimePickerProps) {
  const is24h = isClock24h();
  const isPM = hour >= 12;
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  function setHour12(h12: number) {
    const h24 = isPM ? (h12 === 12 ? 12 : h12 + 12) : h12 === 12 ? 0 : h12;
    onChange(h24, minute);
  }

  function setMinute(m: number) {
    onChange(hour, m);
  }

  function setPeriod(pm: boolean) {
    hapticSelect();
    const h24 = pm ? (hour12 === 12 ? 12 : hour12 + 12) : hour12 === 12 ? 0 : hour12;
    onChange(h24, minute);
  }

  return (
    <div className="wtp">
      <div className="wtp__labels">
        <span>Hour</span>
        <span>Minute</span>
      </div>
      <div className="wtp__wheels">
        {is24h ? (
          <WheelColumn values={HOURS_24} selected={hour} onChange={(h) => onChange(h, minute)} pad />
        ) : (
          <WheelColumn values={HOURS_12} selected={hour12} onChange={setHour12} />
        )}
        <span className="wtp__colon">:</span>
        <WheelColumn values={MINUTES} selected={minute} onChange={setMinute} pad />
      </div>
      {!is24h && (
      <div className="wtp__period">
        <button
          type="button"
          className={`wtp__period-btn${!isPM ? ' wtp__period-btn--active' : ''}`}
          onClick={() => setPeriod(false)}
        >
          AM
        </button>
        <button
          type="button"
          className={`wtp__period-btn${isPM ? ' wtp__period-btn--active' : ''}`}
          onClick={() => setPeriod(true)}
        >
          PM
        </button>
      </div>
      )}
    </div>
  );
}

function WheelColumn({
  values,
  selected,
  onChange,
  pad,
}: {
  values: number[];
  selected: number;
  onChange: (v: number) => void;
  pad?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const settleTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = values.indexOf(selected);
    if (idx === -1) return;
    const target = idx * ROW_HEIGHT;
    if (Math.abs(el.scrollTop - target) < 1) return;
    programmatic.current = true;
    el.scrollTo({ top: target, behavior: 'auto' });
    const t = window.setTimeout(() => {
      programmatic.current = false;
    }, 60);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function settle() {
    const el = ref.current;
    if (!el || programmatic.current) return;
    const idx = Math.max(0, Math.min(values.length - 1, Math.round(el.scrollTop / ROW_HEIGHT)));
    const value = values[idx];
    el.scrollTo({ top: idx * ROW_HEIGHT, behavior: 'smooth' });
    if (value !== selected) {
      hapticSelect();
      onChange(value);
    }
  }

  function handleScroll() {
    if (programmatic.current) return;
    if (settleTimer.current) window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(settle, 120);
  }

  return (
    <div className="wtp__col" ref={ref} onScroll={handleScroll}>
      <div className="wtp__spacer" />
      {values.map((v) => (
        <div key={v} className={`wtp__row${v === selected ? ' wtp__row--selected' : ''}`}>
          {pad ? String(v).padStart(2, '0') : v}
        </div>
      ))}
      <div className="wtp__spacer" />
    </div>
  );
}
