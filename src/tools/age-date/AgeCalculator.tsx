import { useMemo, useState } from 'react';
import { getFirstDayOfWeek } from '../../settings/formats';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon, type IconName } from '../../components/Icon';
import { SearchBar } from '../../components/SearchBar';
import { useRouter } from '../../app/Router';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';
import { hapticSelect, hapticTap } from '../../haptics';
import { ageBreakdown, nextBirthday, parseISODate, toISODate } from './dateMath';
import { PersonEditor } from './PersonEditor';
import { ME_ID, type AvatarPreset, type Person } from './types';
import './AgeDate.css';

type Tab = 'myAge' | 'people' | 'calendar';
type SortMode = 'upcoming' | 'name' | 'oldest';

const AVATAR_ICON: Record<AvatarPreset, IconName> = {
  blue: 'user',
  pink: 'heart',
  orange: 'star',
  green: 'paw',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatShort(iso: string): string {
  const d = parseISODate(iso);
  if (!d) return '—';
  return `${String(d.getDate()).padStart(2, '0')} ${
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
  } ${d.getFullYear()}`;
}

export function AgeCalculator() {
  const { back } = useRouter();
  const today = useMemo(() => new Date(), []);
  const [people, setPeople] = useState<Person[]>(() => storageGet(StorageKeys.people, []));
  const [tab, setTab] = useState<Tab>('myAge');
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('upcoming');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [calendarView, setCalendarView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  function persist(next: Person[]) {
    setPeople(next);
    storageSet(StorageKeys.people, next);
  }

  const me = people.find((p) => p.id === ME_ID);
  const others = people.filter((p) => p.id !== ME_ID);

  function savePerson(person: Person) {
    const exists = people.some((p) => p.id === person.id);
    persist(exists ? people.map((p) => (p.id === person.id ? person : p)) : [person, ...people]);
    setEditingId(null);
  }

  function deletePerson(id: string) {
    if (!window.confirm('Remove this person?')) return;
    persist(people.filter((p) => p.id !== id));
    setEditingId(null);
  }

  function personStats(p: Person) {
    const birth = parseISODate(p.birthISO);
    if (!birth || birth.getTime() > today.getTime()) return null;
    return { breakdown: ageBreakdown(birth, today), next: nextBirthday(birth, today) };
  }

  const filteredOthers = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? others.filter((p) => p.name.toLowerCase().includes(q)) : others;
    list = [...list].sort((a, b) => {
      if (sortMode === 'name') return a.name.localeCompare(b.name);
      if (sortMode === 'oldest') return (parseISODate(a.birthISO)?.getTime() ?? 0) - (parseISODate(b.birthISO)?.getTime() ?? 0);
      const aNext = personStats(a)?.next.daysUntil ?? Infinity;
      const bNext = personStats(b)?.next.daysUntil ?? Infinity;
      return aNext - bNext;
    });
    return list;
  }, [others, search, sortMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Editor sub-view
  if (editingId !== null) {
    const isMe = editingId === ME_ID || (editingId === 'new' && tab === 'myAge' && !me);
    const editingPerson = editingId === 'new' ? undefined : people.find((p) => p.id === editingId);
    return (
      <PersonEditor
        person={editingPerson}
        isMe={isMe}
        onSave={(p) => savePerson(isMe ? { ...p, id: ME_ID } : p)}
        onDelete={editingPerson && editingId !== ME_ID ? () => deletePerson(editingPerson.id) : undefined}
        onClose={() => setEditingId(null)}
      />
    );
  }

  const meStats = me ? personStats(me) : null;

  return (
    <div className="screen">
      <ScreenHeader
        title="Age Calculator"
        subtitle="Calculate ages & remember birthdays"
        onBack={back}
        action={
          <button
            type="button"
            className="pe__save-check ac__header-btn"
            onClick={() => setEditingId(ME_ID)}
            aria-label="My details"
          >
            <Icon name="settings" size={18} />
          </button>
        }
      />

      <div className="ac__tabs">
        <button type="button" className={`ac__tab${tab === 'myAge' ? ' ac__tab--active' : ''}`} onClick={() => setTab('myAge')}>
          My Age
        </button>
        <button type="button" className={`ac__tab${tab === 'people' ? ' ac__tab--active' : ''}`} onClick={() => setTab('people')}>
          People
        </button>
        <button type="button" className={`ac__tab${tab === 'calendar' ? ' ac__tab--active' : ''}`} onClick={() => setTab('calendar')}>
          Calendar
        </button>
      </div>

      {tab === 'myAge' && (
        <div className="ac__body">
          {!me ? (
            <div className="ac__empty">
              <span className="ac__empty-icon">
                <Icon name="cake" size={40} />
              </span>
              <strong>Set your birth date</strong>
              <span>Tap below to calculate your exact age and next birthday.</span>
              <button type="button" className="ad__calculate" onClick={() => setEditingId('new')}>
                <Icon name="plus" size={18} />
                Add My Details
              </button>
            </div>
          ) : (
            <>
              <div className="ac__me-hero" style={{ '--avatar-color': 'var(--blue)' } as React.CSSProperties}>
                <span className="ac__me-avatar">
                  {me.photo ? <img src={me.photo} alt="" /> : <Icon name={AVATAR_ICON[me.avatar]} size={30} />}
                </span>
                <strong>{me.name}</strong>
                <span>Born {formatShort(me.birthISO)}</span>
                <button type="button" className="ac__edit-btn" onClick={() => setEditingId(ME_ID)}>
                  <Icon name="edit" size={14} />
                  Edit
                </button>
              </div>

              {meStats && (
                <>
                  <div className="ad__age-display">
                    <div className="ad__age-unit">
                      <strong>{meStats.breakdown.years}</strong>
                      <span>years</span>
                    </div>
                    <div className="ad__age-unit">
                      <strong>{meStats.breakdown.months}</strong>
                      <span>months</span>
                    </div>
                    <div className="ad__age-unit">
                      <strong>{meStats.breakdown.days}</strong>
                      <span>days</span>
                    </div>
                  </div>

                  <div className="ad__result">
                    <div className="ad__result-row">
                      <span>Total days lived</span>
                      <span>{meStats.breakdown.totalDays.toLocaleString()}</span>
                    </div>
                    <div className="ad__result-row">
                      <span>Next birthday</span>
                      <span>
                        {meStats.next.daysUntil === 0 ? 'Today! \u{1F389}' : `In ${meStats.next.daysUntil} days`}
                      </span>
                    </div>
                    <div className="ad__result-row">
                      <span>Age in weeks</span>
                      <span>{Math.floor(meStats.breakdown.totalDays / 7).toLocaleString()}</span>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'people' && (
        <div className="ac__body">
          <SearchBar value={search} onChange={setSearch} placeholder="Search people..." />

          {me && (
            <div className="ac__me-card">
              <span className="ac__me-card-crown">
                <Icon name="crown" size={13} />
              </span>
              <span className="ac__person-avatar" style={{ '--avatar-color': 'var(--blue)' } as React.CSSProperties}>
                {me.photo ? <img src={me.photo} alt="" /> : <Icon name={AVATAR_ICON[me.avatar]} size={18} />}
              </span>
              <div className="ac__person-main">
                <strong>Me</strong>
                <span>Born {formatShort(me.birthISO)}</span>
              </div>
              <button type="button" className="ac__edit-btn ac__edit-btn--small" onClick={() => setEditingId(ME_ID)}>
                <Icon name="edit" size={13} />
                Edit
              </button>
            </div>
          )}

          <div className="ac__list-header">
            <strong>People ({others.length})</strong>
            <button
              type="button"
              className="ac__sort-btn"
              onClick={() => {
                hapticSelect();
                setSortMode((m) => (m === 'upcoming' ? 'name' : m === 'name' ? 'oldest' : 'upcoming'));
              }}
            >
              <Icon name="sort" size={14} />
              Sort: {sortMode === 'upcoming' ? 'Upcoming' : sortMode === 'name' ? 'Name' : 'Oldest'}
            </button>
          </div>

          {filteredOthers.length === 0 ? (
            <div className="ac__empty ac__empty--compact">
              <Icon name="user" size={32} />
              <span>{others.length === 0 ? 'No people added yet.' : 'No matches.'}</span>
            </div>
          ) : (
            <ul className="ac__person-list">
              {filteredOthers.map((p) => {
                const stats = personStats(p);
                return (
                  <li key={p.id}>
                    <button type="button" className="ac__person-card" onClick={() => setEditingId(p.id)}>
                      <span
                        className="ac__person-avatar"
                        style={{ '--avatar-color': `var(--${p.avatar})` } as React.CSSProperties}
                      >
                        {p.photo ? <img src={p.photo} alt="" /> : <Icon name={AVATAR_ICON[p.avatar]} size={18} />}
                      </span>
                      <div className="ac__person-main">
                        <span className="ac__person-name-row">
                          <strong>{p.name}</strong>
                          {p.relationship && (
                            <em>
                              <Icon name="heart" size={11} /> {p.relationship}
                            </em>
                          )}
                        </span>
                        <span>Born {formatShort(p.birthISO)}</span>
                        {stats && (
                          <span className="ac__person-age">
                            {stats.breakdown.years} years {stats.breakdown.months} months {stats.breakdown.days} days
                          </span>
                        )}
                      </div>
                      {stats && (
                        <span
                          className={`ac__next-badge${stats.next.daysUntil <= 7 && (p.reminderEnabled ?? true) ? ' ac__next-badge--soon' : ''}`}
                        >
                          <strong>{stats.next.daysUntil === 0 ? '🎂' : stats.next.daysUntil}</strong>
                          <span>{stats.next.daysUntil === 0 ? 'Today' : stats.next.daysUntil === 1 ? 'day left' : 'days left'}</span>
                          <em>{formatShort(toISODate(stats.next.date))}</em>
                        </span>
                      )}
                      <Icon name="chevron-right" size={16} className="ac__person-chevron" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            className="ac__fab"
            onClick={() => {
              hapticTap();
              setEditingId('new');
            }}
          >
            <Icon name="plus" size={22} />
          </button>
        </div>
      )}

      {tab === 'calendar' && (
        <CalendarTab
          people={people}
          viewDate={calendarView}
          onShift={(delta) => setCalendarView((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1))}
        />
      )}
    </div>
  );
}

function CalendarTab({
  people,
  viewDate,
  onShift,
}: {
  people: Person[];
  viewDate: Date;
  onShift: (delta: number) => void;
}) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const startsMonday = getFirstDayOfWeek() === 'mon';
  const WEEKDAYS = startsMonday ? WEEKDAYS_MON : WEEKDAYS_SUN;
  const startWeekday = startsMonday ? (firstOfMonth.getDay() + 6) % 7 : firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const birthdaysByDay = new Map<number, Person[]>();
  for (const p of people) {
    const birth = parseISODate(p.birthISO);
    if (!birth || birth.getMonth() !== month) continue;
    // A 29 February birthday is marked on the 28th in a common year instead of on no day at all.
    const day = Math.min(birth.getDate(), daysInMonth);
    const list = birthdaysByDay.get(day) ?? [];
    list.push(p);
    birthdaysByDay.set(day, list);
  }
  const monthBirthdays = [...birthdaysByDay.entries()].sort(([a], [b]) => a - b);

  return (
    <div className="ac__body">
      <div className="ac__cal-card">
        <div className="ac__cal-header">
          <button type="button" onClick={() => onShift(-1)} aria-label="Previous month">
            <Icon name="chevron-right" size={16} className="cal__prev-icon" />
          </button>
          <strong>
            {MONTH_NAMES[month]} {year}
          </strong>
          <button type="button" onClick={() => onShift(1)} aria-label="Next month">
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
            if (day === null) return <span key={`b-${i}`} />;
            const hasBirthday = birthdaysByDay.has(day);
            return (
              <span key={day} className={`ac__cal-day${hasBirthday ? ' ac__cal-day--marked' : ''}`}>
                {day}
                {hasBirthday && <i />}
              </span>
            );
          })}
        </div>
      </div>

      <strong className="ac__cal-list-title">
        Birthdays in {MONTH_NAMES[month]} ({monthBirthdays.reduce((n, [, ppl]) => n + ppl.length, 0)})
      </strong>
      {monthBirthdays.length === 0 ? (
        <div className="ac__empty ac__empty--compact">
          <Icon name="cake" size={32} />
          <span>No birthdays this month.</span>
        </div>
      ) : (
        <ul className="ac__cal-list">
          {monthBirthdays.map(([day, ppl]) =>
            ppl.map((p) => (
              <li key={p.id} className="ac__cal-list-item">
                <span className="ac__cal-list-day">{day}</span>
                <span
                  className="ac__person-avatar ac__person-avatar--sm"
                  style={{ '--avatar-color': `var(--${p.avatar})` } as React.CSSProperties}
                >
                  {p.photo ? <img src={p.photo} alt="" /> : <Icon name={AVATAR_ICON[p.avatar]} size={14} />}
                </span>
                <span>{p.id === ME_ID ? 'Me' : p.name}</span>
              </li>
            )),
          )}
        </ul>
      )}
    </div>
  );
}
