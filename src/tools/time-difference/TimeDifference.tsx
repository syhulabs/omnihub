import { useEffect, useMemo, useState } from 'react';
import { isClock24h } from '../../settings/formats';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { SearchBar } from '../../components/SearchBar';
import { useRouter } from '../../app/Router';
import { useBackHandler } from '../../app/useBackHandler';
import { hapticSelect, hapticTap } from '../../haptics';
import { CITIES, getCityById, type City } from '../time-zone/cities';
import {
  dayPeriod,
  formatFullDate,
  formatTimeLower,
  getOffsetMinutes,
  hourInZone,
  instantAtHourInZone,
} from '../time-zone/offset';
import { WorldMapArc } from './WorldMapArc';
import { projectToPercent } from '../time-zone/worldMap';
import './TimeDifference.css';

type PickerTarget = 'from' | 'to' | null;
type Overlap = 'good' | 'ok' | 'poor';

const WAKING_START = 8;
const WAKING_END = 21;

function formatDiff(fromTimeZone: string, toTimeZone: string, now: Date): { totalMinutes: number; direction: 'ahead' | 'behind' | 'same' } {
  const diff = Math.round(getOffsetMinutes(toTimeZone, now) - getOffsetMinutes(fromTimeZone, now));
  if (diff === 0) return { totalMinutes: 0, direction: 'same' };
  return { totalMinutes: Math.abs(diff), direction: diff > 0 ? 'ahead' : 'behind' };
}

function formatDiffWords(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) return `${hours} hour${hours === 1 ? '' : 's'}`;
  return `${hours}h ${mins}m`;
}

function formatHour12(hour: number): string {
  if (isClock24h()) return `${String(hour).padStart(2, '0')}:00`;
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h} ${hour < 12 ? 'AM' : 'PM'}`;
}

function formatShortDate(date: Date, timeZone: string): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone });
}

export function TimeDifference() {
  const { back } = useRouter();
  const [fromId, setFromId] = useState('kuala-lumpur');
  const [toId, setToId] = useState('new-york');
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [pickerSearch, setPickerSearch] = useState('');
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useBackHandler(() => setPicker(null), picker !== null);

  const fromCity = getCityById(fromId);
  const toCity = getCityById(toId);

  const diff = useMemo(() => {
    if (!fromCity || !toCity) return null;
    return formatDiff(fromCity.timeZone, toCity.timeZone, now);
  }, [fromCity, toCity, now]);

  const sameDate = useMemo(() => {
    if (!fromCity || !toCity) return true;
    return now.toLocaleDateString('en-CA', { timeZone: fromCity.timeZone }) === now.toLocaleDateString('en-CA', { timeZone: toCity.timeZone });
  }, [fromCity, toCity, now]);

  const overlap = useMemo(() => {
    if (!fromCity || !toCity) return null;
    const hours: { hour: number; state: Overlap }[] = [];
    for (let h = 0; h < 24; h++) {
      const instant = instantAtHourInZone(fromCity.timeZone, h, now);
      const toHour = hourInZone(toCity.timeZone, instant);
      const fromAwake = h >= WAKING_START && h < WAKING_END;
      const toAwake = toHour >= WAKING_START && toHour < WAKING_END;
      hours.push({ hour: h, state: fromAwake && toAwake ? 'good' : fromAwake || toAwake ? 'ok' : 'poor' });
    }
    // Collects every contiguous "good" run, not just the first — with a fixed waking window on
    // both sides, a large time-zone offset can produce more than one run tied for the longest
    // length (e.g. a ~12h offset gives two single-hour windows), and the bar already highlights
    // all of them as green, so the summary text needs to name all of them too rather than
    // silently reporting only whichever run happened to come first.
    const runs: { start: number; len: number }[] = [];
    let curStart = -1;
    let curLen = 0;
    for (let i = 0; i < hours.length; i++) {
      if (hours[i].state === 'good') {
        if (curLen === 0) curStart = i;
        curLen++;
      } else {
        if (curLen > 0) runs.push({ start: curStart, len: curLen });
        curLen = 0;
      }
    }
    if (curLen > 0) runs.push({ start: curStart, len: curLen });
    const bestLen = runs.reduce((max, r) => Math.max(max, r.len), 0);
    const bestRuns = runs.filter((r) => r.len === bestLen);
    const currentHour = hourInZone(fromCity.timeZone, now);
    return { hours, bestRuns, bestLen, currentHour };
  }, [fromCity, toCity, now]);

  const pickList = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return CITIES;
    return CITIES.filter((c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q));
  }, [pickerSearch]);

  function selectCity(id: string) {
    hapticSelect();
    if (picker === 'from') setFromId(id);
    else if (picker === 'to') setToId(id);
    setPicker(null);
    setPickerSearch('');
  }

  function swap() {
    hapticTap();
    setFromId(toId);
    setToId(fromId);
  }

  function renderCard(target: 'from' | 'to', city: City | undefined) {
    const time = city ? formatTimeLower(now, city.timeZone) : '--:--';
    const date = city ? formatFullDate(now, city.timeZone) : '';
    return (
      <button type="button" className="tdiff__card" onClick={() => setPicker(target)}>
        <span className={`tdiff__card-badge tdiff__card-badge--${target}`}>
          <Icon name="plus" size={11} /> {target === 'from' ? 'From' : 'To'}
        </span>
        {city && <span className="tdiff__card-flag">{city.flag}</span>}
        <span className="tdiff__card-city">
          {city ? city.name : 'Choose a city'}
          <Icon name="chevron-down" size={13} />
        </span>
        {city && <span className="tdiff__card-country">{city.country}</span>}
        <span className="tdiff__card-time">{time}</span>
        <span className="tdiff__card-date">{date}</span>
      </button>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader title="Time Difference" subtitle="Compare time between two locations" onBack={back} />

      <div className="tdiff__body">
        <div className="tdiff__row">
          {renderCard('from', fromCity)}
          <button type="button" className="tdiff__swap" onClick={swap} aria-label="Swap cities">
            <Icon name="repeat" size={18} />
          </button>
          {renderCard('to', toCity)}
        </div>

        {fromCity && toCity && diff && (
          <div className="tdiff__map-card">
            <div className="tdiff__map-text">
              <span className="tdiff__map-label">Time Difference</span>
              <strong className="tdiff__map-value">
                {diff.direction === 'same' ? 'Same time' : formatDiffWords(diff.totalMinutes)}
              </strong>
              {diff.direction !== 'same' && (
                <span className="tdiff__map-sub">
                  {toCity.name} is <em>{diff.direction}</em> {fromCity.name}
                </span>
              )}
            </div>
            <div className="tdiff__map-area">
              <WorldMapArc fromLat={fromCity.lat} fromLon={fromCity.lon} toLat={toCity.lat} toLon={toCity.lon} />
              <MapPinLabel city={fromCity} now={now} />
              <MapPinLabel city={toCity} now={now} />
            </div>
          </div>
        )}

        {fromCity && toCity && diff && (
          <div className="tdiff__details">
            <DetailRow icon="clock" label="Time Difference" value={diff.direction === 'same' ? 'Same time' : formatDiffWords(diff.totalMinutes)} accent />
            {diff.direction !== 'same' && <DetailRow icon="repeat" label={`${toCity.name} is`} value={diff.direction} accent />}
            <DetailRow
              icon="calendar"
              label={sameDate ? 'Same Date' : 'Dates'}
              value={
                sameDate
                  ? formatFullDate(now, fromCity.timeZone)
                  : `${formatShortDate(now, fromCity.timeZone)} / ${formatShortDate(now, toCity.timeZone)}`
              }
            />
            <ReciprocalRow
              icon={dayPeriod(fromCity.timeZone, now) === 'sun' || dayPeriod(fromCity.timeZone, now) === 'sunrise' ? 'sun' : 'moon'}
              main={`When it's ${formatTimeLower(now, fromCity.timeZone)} in ${fromCity.name}`}
              sub={`It's ${formatTimeLower(now, toCity.timeZone)} in ${toCity.name}`}
            />
            <ReciprocalRow
              icon={dayPeriod(toCity.timeZone, now) === 'sun' || dayPeriod(toCity.timeZone, now) === 'sunrise' ? 'sun' : 'moon'}
              main={`When it's ${formatTimeLower(now, toCity.timeZone)} in ${toCity.name}`}
              sub={`It's ${formatTimeLower(now, fromCity.timeZone)} in ${fromCity.name}`}
            />
          </div>
        )}

        {fromCity && toCity && overlap && (
          <div className="tdiff__overlap">
            <div className="tdiff__overlap-head">
              <span className="tdiff__overlap-icon">
                <Icon name="clock" size={16} />
              </span>
              <div>
                <strong>Best Time to Connect</strong>
                <span>Waking hours ({formatHour12(8)} – {formatHour12(21)}) in both places</span>
              </div>
            </div>

            <div className="tdiff__bar">
              {overlap.hours.map(({ hour, state }) => (
                <span
                  key={hour}
                  className={`tdiff__seg tdiff__seg--${state}${hour === overlap.currentHour ? ' tdiff__seg--now' : ''}`}
                />
              ))}
            </div>
            <div className="tdiff__bar-labels">
              <span>{formatHour12(0)}</span>
              <span>{formatHour12(6)}</span>
              <span>{formatHour12(12)}</span>
              <span>{formatHour12(18)}</span>
              <span>{formatHour12(0)}</span>
            </div>

            <div className="tdiff__legend">
              <span>
                <i className="tdiff__legend-dot tdiff__legend-dot--good" /> Good for both
              </span>
              <span>
                <i className="tdiff__legend-dot tdiff__legend-dot--ok" /> One is asleep
              </span>
              <span>
                <i className="tdiff__legend-dot tdiff__legend-dot--now" /> Now
              </span>
            </div>

            <p className="tdiff__overlap-note">
              {overlap.bestLen > 0 ? (
                <>
                  <strong>
                    {overlap.bestRuns
                      .map((r) => `${formatHour12(r.start)} – ${formatHour12((r.start + r.len) % 24)}`)
                      .join(' and ')}
                  </strong>{' '}
                  in {fromCity.name} works well for both of you.
                </>
              ) : (
                <>No overlapping waking hours — this pair is best for async messages.</>
              )}
            </p>
          </div>
        )}

        <button type="button" className="tdiff__change-btn" onClick={() => setPicker('from')}>
          <Icon name="plus" size={16} />
          Change Locations
        </button>
      </div>

      {picker && (
        <div className="tdiff__sheet" onClick={() => setPicker(null)}>
          <div className="tdiff__sheet-content" onClick={(e) => e.stopPropagation()}>
            <h2>Choose a City</h2>
            <SearchBar value={pickerSearch} onChange={setPickerSearch} placeholder="Search cities or countries..." autoFocus />
            <ul className="tdiff__pick-list">
              {pickList.map((city) => (
                <li key={city.id}>
                  <button type="button" className="tdiff__pick-item" onClick={() => selectCity(city.id)}>
                    <span className="tdiff__pick-flag">{city.flag}</span>
                    <span className="tdiff__pick-info">
                      <strong>{city.name}</strong>
                      <span className="tdiff__pick-country">{city.country}</span>
                    </span>
                    {(picker === 'from' ? fromId : toId) === city.id && <Icon name="check" size={16} />}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="tdiff__sheet-close" onClick={() => setPicker(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MapPinLabel({ city, now }: { city: City; now: Date }) {
  const { xPct, yPct } = projectToPercent(city.lon, city.lat);
  const period = dayPeriod(city.timeZone, now);
  const isDay = period === 'sun' || period === 'sunrise';
  return (
    <div className="wmarc__label" style={{ left: `${xPct}%`, top: `${yPct}%` }}>
      <span className={`wmarc__label-icon${isDay ? '' : ' wmarc__label-icon--night'}`}>
        <Icon name={isDay ? 'sun' : 'moon'} size={13} />
      </span>
      <strong>{city.name}</strong>
      <span>{formatTimeLower(now, city.timeZone)}</span>
    </div>
  );
}

function DetailRow({ icon, label, value, accent }: { icon: Parameters<typeof Icon>[0]['name']; label: string; value: string; accent?: boolean }) {
  return (
    <div className="tdiff__detail-row">
      <span className="tdiff__detail-icon">
        <Icon name={icon} size={16} />
      </span>
      <span className="tdiff__detail-label">{label}</span>
      <span className={`tdiff__detail-value${accent ? ' tdiff__detail-value--accent' : ''}`}>{value}</span>
    </div>
  );
}

function ReciprocalRow({ icon, main, sub }: { icon: Parameters<typeof Icon>[0]['name']; main: string; sub: string }) {
  return (
    <div className="tdiff__detail-row tdiff__detail-row--stacked">
      <span className="tdiff__detail-icon">
        <Icon name={icon} size={16} />
      </span>
      <span className="tdiff__detail-stack">
        <strong>{main}</strong>
        <span>{sub}</span>
      </span>
    </div>
  );
}
