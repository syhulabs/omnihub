import { useEffect, useMemo, useRef, useState } from 'react';
import { formatClockDate, isClock24h } from '../../settings/formats';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { SearchBar } from '../../components/SearchBar';
import { WheelTimePicker } from '../alarm/WheelTimePicker';
import { useRouter } from '../../app/Router';
import { useBackHandler } from '../../app/useBackHandler';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';
import { hapticSelect, hapticTap } from '../../haptics';
import { CITIES, getCityById, getCityByTimeZone, type City } from './cities';
import {
  dayOffsetLabel,
  dayPeriod,
  formatTimeLower,
  zoneAbbreviation,
  formatWorldClockDiff,
  formatZoneLabel,
  friendlyZoneName,
  offsetHoursForSort,
} from './offset';
import { getSunTimes } from './sunTimes';
import { EarthGlobe } from './EarthGlobe';
import './TimeZone.css';

const DEFAULT_CITY_IDS = ['kuala-lumpur', 'new-york', 'london', 'mumbai', 'tokyo', 'sydney'];
type Tab = 'clock' | 'favorites' | 'converter';
type SortMode = 'added' | 'offset' | 'name';

function formatHeroDate(date: Date): string {
  return date.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatRowDate(date: Date, timeZone: string): string {
  const weekday = date.toLocaleDateString('en-US', { weekday: 'short', timeZone });
  const day = date.toLocaleDateString('en-US', { day: 'numeric', timeZone });
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone });
  return `${weekday}, ${day} ${month}`;
}

export function TimeZone() {
  const { back } = useRouter();
  const [cityIds, setCityIds] = useState<string[]>(() => storageGet(StorageKeys.timeZoneCities, DEFAULT_CITY_IDS));
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => storageGet(StorageKeys.timeZoneFavorites, []));
  const [now, setNow] = useState(new Date());
  const [tab, setTab] = useState<Tab>('clock');
  const [search, setSearch] = useState('');
  const [menuCity, setMenuCity] = useState<City | null>(null);
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('added');
  const [convHour, setConvHour] = useState(now.getHours());
  const [convMinute, setConvMinute] = useState(now.getMinutes());
  const searchWrapRef = useRef<HTMLDivElement>(null);

  function focusSearch() {
    hapticTap();
    searchWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    searchWrapRef.current?.querySelector('input')?.focus();
  }

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  useBackHandler(() => {
    if (menuCity) setMenuCity(null);
    else if (showSortSheet) setShowSortSheet(false);
  }, Boolean(menuCity) || showSortSheet);

  function persistCities(next: string[]) {
    setCityIds(next);
    storageSet(StorageKeys.timeZoneCities, next);
  }

  function persistFavorites(next: string[]) {
    setFavoriteIds(next);
    storageSet(StorageKeys.timeZoneFavorites, next);
  }

  function addCity(id: string) {
    hapticSelect();
    if (!cityIds.includes(id)) persistCities([...cityIds, id]);
    setSearch('');
  }

  function removeCity(id: string) {
    persistCities(cityIds.filter((c) => c !== id));
    if (favoriteIds.includes(id)) persistFavorites(favoriteIds.filter((f) => f !== id));
    setMenuCity(null);
  }

  function toggleFavorite(id: string) {
    hapticSelect();
    persistFavorites(favoriteIds.includes(id) ? favoriteIds.filter((f) => f !== id) : [...favoriteIds, id]);
    setMenuCity(null);
  }

  const localTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const localCity = useMemo(() => getCityByTimeZone(localTimeZone), [localTimeZone]);
  const localSunTimes = useMemo(
    () => (localCity ? getSunTimes(now, localCity.lat, localCity.lon) : null),
    [localCity, now],
  );

  const cities = useMemo(() => cityIds.map(getCityById).filter((c): c is City => !!c), [cityIds]);
  const favoriteCities = useMemo(() => cities.filter((c) => favoriteIds.includes(c.id)), [cities, favoriteIds]);

  function sortList(list: City[]): City[] {
    if (sortMode === 'name') return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sortMode === 'offset') return [...list].sort((a, b) => offsetHoursForSort(a.timeZone, now) - offsetHoursForSort(b.timeZone, now));
    return list;
  }

  function filterBySearch(list: City[]): City[] {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q) || c.timeZone.toLowerCase().includes(q),
    );
  }

  const visibleClock = useMemo(() => sortList(filterBySearch(cities)), [cities, search, sortMode, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const visibleFavorites = useMemo(() => sortList(filterBySearch(favoriteCities)), [favoriteCities, search, sortMode, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const addSuggestions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || tab !== 'clock') return [];
    return CITIES.filter((c) => !cityIds.includes(c.id))
      .filter((c) => c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q))
      .slice(0, 6);
  }, [search, cityIds, tab]);

  const convertBase = useMemo(() => {
    const base = new Date(now);
    base.setHours(convHour, convMinute, 0, 0);
    return base;
  }, [convHour, convMinute, now]);

  function renderRow(city: City) {
    const isLocal = city.timeZone === localTimeZone;
    const isFavorite = favoriteIds.includes(city.id);
    const time = formatClockDate(now, city.timeZone);
    const dateLabel = formatRowDate(now, city.timeZone);
    return (
      <li key={city.id}>
        <div className={`tz__row2${isLocal ? ' tz__row2--local' : ''}`}>
          <span className="tz__row2-flag">{city.flag}</span>
          <div className="tz__row2-info">
            <span className="tz__row2-name">
              {city.name}
              {isLocal && <em className="tz__local-badge">Local</em>}
              {isFavorite && <Icon name="star" size={11} className="tz__row2-fav-icon" />}
            </span>
            <span className="tz__row2-country">{city.country}</span>
            <span className="tz__row2-zone">{formatZoneLabel(city.timeZone, now)}</span>
            {!isLocal && <span className="tz__row2-diff">{formatWorldClockDiff(city.timeZone, now)}</span>}
          </div>
          <div className="tz__row2-time-col">
            <span className={`tz__row2-time-pill${isLocal ? ' tz__row2-time-pill--local' : ''}`}>
              {time.replace(/(AM|PM)/i, (m) => m.toLowerCase())}
            </span>
            <span className="tz__row2-date">{dateLabel}</span>
          </div>
          <button type="button" className="tz__row2-menu" onClick={() => setMenuCity(city)} aria-label="More options">
            <Icon name="more-dots" size={16} />
          </button>
        </div>
      </li>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader title="Time Zone" subtitle="Explore time around the world" onBack={back} />

      <div className="tz__body">
        <div className="tz__hero2">
          <div className="tz__hero2-info">
            <span className="tz__hero2-pin">
              <Icon name="pin" size={13} />
              {localCity ? localCity.name : friendlyZoneName(localTimeZone)}
            </span>
            <span className="tz__hero2-country">
              {localCity ? `${localCity.country} ` : ''}({zoneAbbreviation(localTimeZone, now) || formatZoneLabel(localTimeZone, now)})
            </span>
            <span className="tz__hero2-time">
              {formatTimeLower(now).replace(/\s?(am|pm)/i, '')}
              {!isClock24h() && <em>{now.getHours() < 12 ? 'am' : 'pm'}</em>}
            </span>
            <span className="tz__hero2-date">{formatHeroDate(now)}</span>
          </div>

          {localCity && (
            <>
              <div className="tz__hero2-globe">
                <EarthGlobe lat={localCity.lat} lon={localCity.lon} />
              </div>
              {localSunTimes && (
                <div className="tz__hero2-daynight">
                  <div className="tz__hero2-dn-row">
                    <Icon name="sun" size={13} />
                    <span>
                      Day
                      <em>
                        {formatTimeLower(localSunTimes.sunrise, localCity.timeZone)} – {formatTimeLower(localSunTimes.sunset, localCity.timeZone)}
                      </em>
                    </span>
                  </div>
                  <div className="tz__hero2-dn-row">
                    <Icon name="moon" size={13} />
                    <span>
                      Night
                      <em>
                        {formatTimeLower(localSunTimes.sunset, localCity.timeZone)} – {formatTimeLower(localSunTimes.sunrise, localCity.timeZone)}
                      </em>
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {tab !== 'converter' && (
          <div className="tz__search-row">
            <div ref={searchWrapRef} className="tz__search-wrap">
              <SearchBar value={search} onChange={setSearch} placeholder="Search city, country or time zone..." />
            </div>
            <button type="button" className="tz__filter-btn" onClick={() => setShowSortSheet(true)} aria-label="Sort">
              <Icon name="sort" size={17} />
            </button>
          </div>
        )}

        <div className="tz__tabs">
          <button type="button" className={`tz__tab${tab === 'clock' ? ' tz__tab--active' : ''}`} onClick={() => setTab('clock')}>
            <Icon name="clock" size={14} /> World Clock
          </button>
          <button type="button" className={`tz__tab${tab === 'favorites' ? ' tz__tab--active' : ''}`} onClick={() => setTab('favorites')}>
            <Icon name="star" size={14} /> Favorites
          </button>
          <button type="button" className={`tz__tab${tab === 'converter' ? ' tz__tab--active' : ''}`} onClick={() => setTab('converter')}>
            <Icon name="repeat" size={14} /> Time Converter
          </button>
        </div>

        {tab === 'clock' && (
          <>
            {visibleClock.length === 0 ? (
              <p className="tz__empty">{search ? 'No added cities match.' : 'No cities added yet — search above to add one.'}</p>
            ) : (
              <ul className="tz__list2">{visibleClock.map(renderRow)}</ul>
            )}

            {addSuggestions.length > 0 && (
              <div className="tz__suggest">
                <span className="tz__suggest-label">Add a city</span>
                <ul className="tz__suggest-list">
                  {addSuggestions.map((city) => (
                    <li key={city.id}>
                      <button type="button" className="tz__suggest-item" onClick={() => addCity(city.id)}>
                        <span className="tz__suggest-flag">{city.flag}</span>
                        <span className="tz__suggest-info">
                          <strong>{city.name}</strong>
                          <span>{city.country}</span>
                        </span>
                        <Icon name="plus" size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button type="button" className="tz__add-btn" onClick={focusSearch}>
              <Icon name="plus" size={18} />
              Add City
            </button>
          </>
        )}

        {tab === 'favorites' &&
          (visibleFavorites.length === 0 ? (
            <p className="tz__empty">
              {favoriteCities.length === 0
                ? 'No favorites yet — open a city’s ⋮ menu on World Clock and add it here.'
                : 'No favorites match.'}
            </p>
          ) : (
            <ul className="tz__list2">{visibleFavorites.map(renderRow)}</ul>
          ))}

        {tab === 'converter' && (
          <>
            <div className="tz__conv-hint">
              <Icon name="info" size={16} />
              <span>Pick a time in your local zone to see what it is everywhere else.</span>
            </div>

            <WheelTimePicker hour={convHour} minute={convMinute} onChange={(h, m) => { setConvHour(h); setConvMinute(m); }} />

            {cities.length === 0 ? (
              <p className="tz__empty">Add a city on World Clock to convert times.</p>
            ) : (
              <ul className="tz__list">
                {cities.map((city) => {
                  const time = formatClockDate(convertBase, city.timeZone);
                  const dayLabel = dayOffsetLabel(city.timeZone, convertBase);
                  const period = dayPeriod(city.timeZone, convertBase);
                  return (
                    <li key={city.id}>
                      <div className="tz__row">
                        <span className={`tz__row-period tz__row-period--${period}`}>
                          <Icon name={period} size={18} />
                        </span>
                        <span className="tz__row-info">
                          <span className="tz__row-name">
                            {city.name}
                            {dayLabel && <em className="tz__row-day-badge">{dayLabel}</em>}
                          </span>
                          <span className="tz__row-diff">{city.country}</span>
                        </span>
                        <span className="tz__row-time-block">
                          <span className="tz__row-time">{time}</span>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>

      {menuCity && (
        <div className="tz__sheet" onClick={() => setMenuCity(null)}>
          <div className="tz__sheet-content" onClick={(e) => e.stopPropagation()}>
            <h2>
              {menuCity.flag} {menuCity.name}
            </h2>
            <button type="button" className="tz__menu-item" onClick={() => toggleFavorite(menuCity.id)}>
              <Icon name="star" size={16} />
              {favoriteIds.includes(menuCity.id) ? 'Remove from Favorites' : 'Add to Favorites'}
            </button>
            <button type="button" className="tz__menu-item tz__menu-item--danger" onClick={() => removeCity(menuCity.id)}>
              <Icon name="trash" size={16} />
              Remove City
            </button>
            <button type="button" className="tz__sheet-close" onClick={() => setMenuCity(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {showSortSheet && (
        <div className="tz__sheet" onClick={() => setShowSortSheet(false)}>
          <div className="tz__sheet-content" onClick={(e) => e.stopPropagation()}>
            <h2>Sort By</h2>
            {(['added', 'offset', 'name'] as SortMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`tz__menu-item${sortMode === mode ? ' tz__menu-item--active' : ''}`}
                onClick={() => {
                  hapticTap();
                  setSortMode(mode);
                  setShowSortSheet(false);
                }}
              >
                <Icon name={mode === 'added' ? 'plus' : mode === 'offset' ? 'clock' : 'sort'} size={16} />
                {mode === 'added' ? 'Order Added' : mode === 'offset' ? 'Time Offset' : 'City Name'}
                {sortMode === mode && <Icon name="check" size={16} className="tz__menu-check" />}
              </button>
            ))}
            <button type="button" className="tz__sheet-close" onClick={() => setShowSortSheet(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
