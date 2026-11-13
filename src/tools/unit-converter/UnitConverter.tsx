import { useMemo, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { UNIT_CATEGORIES, convert } from './data';
import { getMeasurementSystem } from '../../settings/formats';
import './UnitConverter.css';

/** Starting from/to pair per category: the user's own system first (Settings > Time & Formats),
 *  the other one as the target, since that's the conversion people actually open the tool for. */
const DEFAULT_PAIRS: Record<string, { metric: [string, string]; imperial: [string, string] }> = {
  length: { metric: ['cm', 'in'], imperial: ['in', 'cm'] },
  weight: { metric: ['kg', 'lb'], imperial: ['lb', 'kg'] },
  temperature: { metric: ['c', 'f'], imperial: ['f', 'c'] },
  volume: { metric: ['l', 'gal'], imperial: ['gal', 'l'] },
  speed: { metric: ['kmh', 'mph'], imperial: ['mph', 'kmh'] },
  area: { metric: ['m2', 'ft2'], imperial: ['ft2', 'm2'] },
};

function defaultUnits(categoryId: string): [string, string] {
  const category = UNIT_CATEGORIES.find((c) => c.id === categoryId)!;
  const pair = DEFAULT_PAIRS[categoryId]?.[getMeasurementSystem()];
  if (pair && pair.every((id) => category.units.some((u) => u.id === id))) return pair;
  return [category.units[0].id, category.units[1].id];
}

function formatNumber(value: number): string {
  if (Number.isNaN(value) || !Number.isFinite(value)) return '—';
  // Significant digits rather than decimal places, so 1 byte in GB or 1 mg in tons doesn't round to
  // a flat 0. Twelve keeps large values whole (123456789 mm is 123456.789 m) and still hides the
  // last-digit noise of the conversion arithmetic.
  return Number(value.toPrecision(12)).toString();
}

export function UnitConverter() {
  const { back } = useRouter();
  const [categoryId, setCategoryId] = useState(UNIT_CATEGORIES[0].id);
  const category = UNIT_CATEGORIES.find((c) => c.id === categoryId)!;
  const [fromUnitId, setFromUnitId] = useState(() => defaultUnits(categoryId)[0]);
  const [toUnitId, setToUnitId] = useState(() => defaultUnits(categoryId)[1]);
  const [value, setValue] = useState('1');

  function selectCategory(id: string) {
    const [from, to] = defaultUnits(id);
    setCategoryId(id);
    setFromUnitId(from);
    setToUnitId(to);
  }

  const result = useMemo(() => {
    const numeric = parseFloat(value);
    if (Number.isNaN(numeric)) return '';
    return formatNumber(convert(category, fromUnitId, toUnitId, numeric));
  }, [category, fromUnitId, toUnitId, value]);

  function swap() {
    setFromUnitId(toUnitId);
    setToUnitId(fromUnitId);
    if (result) setValue(result);
  }

  return (
    <div className="screen">
      <ScreenHeader title="Unit Converter" subtitle="Convert between units instantly" onBack={back} />

      <div className="uc__tabs">
        {UNIT_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`uc__tab${cat.id === categoryId ? ' uc__tab--active' : ''}`}
            onClick={() => selectCategory(cat.id)}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="uc__body">
        <div className="uc__field">
          <label className="uc__label">
            <span className="uc__label-icon uc__label-icon--purple">
              <Icon name="converter" size={13} />
            </span>
            From
          </label>
          <div className="uc__row">
            <input
              className="uc__input"
              type="number"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="0"
            />
            <select
              className="uc__select"
              value={fromUnitId}
              onChange={(e) => setFromUnitId(e.target.value)}
            >
              {category.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button type="button" className="uc__swap" onClick={swap} aria-label="Swap units">
          <Icon name="converter" size={20} />
        </button>

        <div className="uc__field uc__field--result">
          <label className="uc__label">
            <span className="uc__label-icon uc__label-icon--accent">
              <Icon name="check" size={13} />
            </span>
            To
          </label>
          <div className="uc__row">
            <div className="uc__result">{result || '—'}</div>
            <select
              className="uc__select"
              value={toUnitId}
              onChange={(e) => setToUnitId(e.target.value)}
            >
              {category.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
