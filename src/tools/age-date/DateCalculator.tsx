import { useEffect, useMemo, useState } from 'react';
import { formatNumericDate } from '../../settings/formats';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { hapticTap } from '../../haptics';
import { addDays, ageBreakdown, daysBetween, parseISODate, toISODate } from './dateMath';
import { CalendarPicker } from './CalendarPicker';
import './AgeDate.css';

type Mode = 'difference' | 'shift';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatFriendly(date: Date): string {
  return `${WEEKDAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function formatShort(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return 'Select date';
  return formatNumericDate(d);
}

export function DateCalculator() {
  const { back } = useRouter();
  const [mode, setMode] = useState<Mode>('difference');
  const today = useMemo(() => new Date(), []);

  const [dateAISO, setDateAISO] = useState(toISODate(today));
  const [dateBISO, setDateBISO] = useState('');
  const [computed, setComputed] = useState(false);

  const [shiftDateISO, setShiftDateISO] = useState(toISODate(today));
  const [shiftAmount, setShiftAmount] = useState('7');
  const [shiftDirection, setShiftDirection] = useState<1 | -1>(1);

  useEffect(() => {
    setComputed(false);
  }, [dateAISO, dateBISO]);

  const dateA = parseISODate(dateAISO);
  const dateB = parseISODate(dateBISO);

  const diffResult = useMemo(() => {
    if (!dateA || !dateB) return null;
    const [earlier, later] = dateA.getTime() <= dateB.getTime() ? [dateA, dateB] : [dateB, dateA];
    const totalDays = daysBetween(earlier, later);
    const breakdown = ageBreakdown(earlier, later);
    return {
      totalDays,
      breakdown,
      totalWeeks: Math.floor(totalDays / 7),
      totalMonths: breakdown.years * 12 + breakdown.months,
      sameDate: totalDays === 0,
    };
  }, [dateA, dateB]);

  function swapDates() {
    hapticTap();
    setDateAISO(dateBISO || dateAISO);
    setDateBISO(dateAISO);
  }

  const shiftDate = parseISODate(shiftDateISO);
  const shiftResult = useMemo(() => {
    if (!shiftDate) return null;
    const amount = parseInt(shiftAmount, 10) || 0;
    return addDays(shiftDate, amount * shiftDirection);
  }, [shiftDate, shiftAmount, shiftDirection]);

  return (
    <div className="screen">
      <ScreenHeader title="Date Calculator" subtitle="Calculate the difference between dates" onBack={back} />

      <div className="ad__switch">
        <button
          type="button"
          className={`ad__switch-btn${mode === 'difference' ? ' ad__switch-btn--active' : ''}`}
          onClick={() => setMode('difference')}
        >
          <Icon name="calendar" size={15} />
          Difference
        </button>
        <button
          type="button"
          className={`ad__switch-btn${mode === 'shift' ? ' ad__switch-btn--active' : ''}`}
          onClick={() => setMode('shift')}
        >
          <Icon name="plus" size={15} />
          Add / Subtract
        </button>
      </div>

      {mode === 'difference' ? (
        <div className="ad__body">
          <div className="ad__info-banner">
            <Icon name="info" size={18} />
            <div>
              <strong>Find the time between two dates</strong>
              <span>See the difference in days, weeks, months and years.</span>
            </div>
          </div>

          <div className="ad__cal-row">
            <div className="ad__cal-col">
              <label className="ad__label">From</label>
              <div className="ad__cal-value">
                <Icon name="calendar" size={15} />
                {formatShort(dateAISO)}
              </div>
              <CalendarPicker selectedISO={dateAISO} onSelect={setDateAISO} accentColor="var(--blue)" />
            </div>
            <div className="ad__cal-col">
              <label className="ad__label">To</label>
              <div className="ad__cal-value">
                <Icon name="calendar" size={15} />
                {dateBISO ? formatShort(dateBISO) : 'Select date'}
              </div>
              <CalendarPicker selectedISO={dateBISO} onSelect={setDateBISO} accentColor="var(--purple)" />
            </div>
          </div>

          <button type="button" className="ad__swap" onClick={swapDates} disabled={!dateBISO} aria-label="Swap dates">
            <Icon name="converter" size={18} />
          </button>
          <p className="ad__swap-label">Swap dates</p>

          <button
            type="button"
            className="ad__calculate"
            disabled={!dateBISO}
            onClick={() => {
              hapticTap();
              setComputed(true);
            }}
          >
            <Icon name="calculator" size={18} />
            Calculate Difference
          </button>

          {computed && diffResult && (
            <div className="ad__result-panel">
              <div className="ad__result-header">
                <Icon name="clock" size={18} />
                <div>
                  <strong>Result</strong>
                  <span>Time between the selected dates</span>
                </div>
              </div>

              <div className="ad__stat-grid">
                <div className="ad__stat-card ad__stat-card--blue">
                  <Icon name="calendar" size={18} />
                  <strong>{diffResult.breakdown.years}</strong>
                  <span>Years</span>
                </div>
                <div className="ad__stat-card ad__stat-card--green">
                  <Icon name="calendar" size={18} />
                  <strong>{diffResult.breakdown.months}</strong>
                  <span>Months</span>
                </div>
                <div className="ad__stat-card ad__stat-card--orange">
                  <Icon name="calendar" size={18} />
                  <strong>{diffResult.breakdown.days}</strong>
                  <span>Days</span>
                </div>
                <div className="ad__stat-card ad__stat-card--purple">
                  <Icon name="calendar" size={18} />
                  <strong>{diffResult.totalWeeks}</strong>
                  <span>Weeks</span>
                </div>
              </div>

              <div className="ad__detail-rows">
                <div className="ad__detail-row">
                  <Icon name="clock" size={16} style={{ color: 'var(--red)' }} />
                  <span>Total days</span>
                  <strong>{diffResult.totalDays.toLocaleString()} days</strong>
                </div>
                <div className="ad__detail-row">
                  <Icon name="clock" size={16} style={{ color: 'var(--blue)' }} />
                  <span>Total weeks</span>
                  <strong>{diffResult.totalWeeks.toLocaleString()} weeks</strong>
                </div>
                <div className="ad__detail-row">
                  <Icon name="calendar" size={16} style={{ color: 'var(--green)' }} />
                  <span>Total months</span>
                  <strong>{diffResult.totalMonths.toLocaleString()} months</strong>
                </div>
                <div className="ad__detail-row">
                  <Icon name="calendar" size={16} style={{ color: 'var(--purple)' }} />
                  <span>Total years</span>
                  <strong>{diffResult.breakdown.years.toLocaleString()} years</strong>
                </div>
              </div>
            </div>
          )}

          <p className="ad__tip">
            <Icon name="lightbulb" size={16} />
            <span>
              <strong>Tip:</strong> You can also use Add / Subtract to find a date by adding or subtracting days,
              weeks, months or years.
            </span>
          </p>
        </div>
      ) : (
        <div className="ad__body">
          <label className="ad__label">Start Date</label>
          <div className="ad__cal-value">
            <Icon name="calendar" size={15} />
            {formatShort(shiftDateISO)}
          </div>
          <CalendarPicker selectedISO={shiftDateISO} onSelect={setShiftDateISO} accentColor="var(--blue)" />

          <div className="ad__field">
            <label className="ad__label">Days</label>
            <div className="ad__shift-row">
              <button
                type="button"
                className={`ad__shift-toggle${shiftDirection === -1 ? ' ad__shift-toggle--active' : ''}`}
                onClick={() => setShiftDirection(-1)}
              >
                Subtract
              </button>
              <input
                className="ad__shift-input"
                type="number"
                inputMode="numeric"
                min={0}
                value={shiftAmount}
                onChange={(e) => setShiftAmount(e.target.value)}
              />
              <button
                type="button"
                className={`ad__shift-toggle${shiftDirection === 1 ? ' ad__shift-toggle--active' : ''}`}
                onClick={() => setShiftDirection(1)}
              >
                Add
              </button>
            </div>
          </div>

          {shiftResult && (
            <div className="ad__result">
              <div className="ad__result-highlight ad__result-highlight--small">{formatFriendly(shiftResult)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
