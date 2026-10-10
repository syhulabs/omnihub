import { useEffect, useState } from 'react';
import { Icon } from '../../components/Icon';
import { hapticSelect } from '../../haptics';
import { parseISODate, toISODate } from './dateMath';
import { getFirstDayOfWeek } from '../../settings/formats';

const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const YEARS_PER_PAGE = 12;

interface CalendarPickerProps {
  selectedISO: string;
  onSelect: (iso: string) => void;
  accentColor?: string;
}

export function CalendarPicker({ selectedISO, onSelect, accentColor }: CalendarPickerProps) {
  const selected = parseISODate(selectedISO);
  const [viewDate, setViewDate] = useState(() => selected ?? new Date());
  const [view, setView] = useState<'days' | 'years'>('days');
  const [yearsStart, setYearsStart] = useState(() => Math.floor((selected ?? new Date()).getFullYear() / YEARS_PER_PAGE) * YEARS_PER_PAGE);

  useEffect(() => {
    if (selected) setViewDate(selected);
  }, [selectedISO]); // eslint-disable-line react-hooks/exhaustive-deps

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startsMonday = getFirstDayOfWeek() === 'mon';
  const WEEKDAYS = startsMonday ? WEEKDAYS_MON : WEEKDAYS_SUN;
  // Offset of the 1st within the first row, counted from the chosen first day of the week.
  const startWeekday = startsMonday ? (firstOfMonth.getDay() + 6) % 7 : firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  function shiftMonth(delta: number) {
    hapticSelect();
    setViewDate(new Date(year, month + delta, 1));
  }

  function pickDay(day: number) {
    hapticSelect();
    onSelect(toISODate(new Date(year, month, day)));
  }

  function openYears() {
    hapticSelect();
    setYearsStart(Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE);
    setView('years');
  }

  function shiftYears(delta: number) {
    hapticSelect();
    setYearsStart((y) => y + delta * YEARS_PER_PAGE);
  }

  function pickYear(y: number) {
    hapticSelect();
    setViewDate(new Date(y, month, 1));
    setView('days');
  }

  return (
    <div className="cal" style={accentColor ? ({ '--cal-accent': accentColor } as React.CSSProperties) : undefined}>
      {view === 'days' ? (
        <>
          <div className="cal__header">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <Icon name="chevron-right" size={16} className="cal__prev-icon" />
            </button>
            <button type="button" className="cal__header-label" onClick={openYears}>
              <strong>
                {MONTH_NAMES[month]} {year}
              </strong>
              <Icon name="chevron-down" size={14} />
            </button>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month">
              <Icon name="chevron-right" size={16} />
            </button>
          </div>
          <div className="cal__weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div className="cal__grid">
            {cells.map((day, i) => {
              if (day === null) return <span key={`blank-${i}`} />;
              const iso = toISODate(new Date(year, month, day));
              const isSelected = iso === selectedISO;
              return (
                <button
                  key={day}
                  type="button"
                  className={`cal__day${isSelected ? ' cal__day--selected' : ''}`}
                  onClick={() => pickDay(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <div className="cal__header">
            <button type="button" onClick={() => shiftYears(-1)} aria-label="Previous years">
              <Icon name="chevron-right" size={16} className="cal__prev-icon" />
            </button>
            <strong>
              {yearsStart} – {yearsStart + YEARS_PER_PAGE - 1}
            </strong>
            <button type="button" onClick={() => shiftYears(1)} aria-label="Next years">
              <Icon name="chevron-right" size={16} />
            </button>
          </div>
          <div className="cal__year-grid">
            {Array.from({ length: YEARS_PER_PAGE }, (_, i) => yearsStart + i).map((y) => (
              <button
                key={y}
                type="button"
                className={`cal__year${y === year ? ' cal__year--selected' : ''}`}
                onClick={() => pickYear(y)}
              >
                {y}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
