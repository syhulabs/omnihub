import { useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Icon, type IconName } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { useBackHandler } from '../../app/useBackHandler';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';
import { hapticTap } from '../../haptics';
import { DiceFace } from './DiceFace';
import './RandomGenerator.css';

type Mode = 'dice' | 'coin' | 'number' | 'list';

const DIE_TYPES = [4, 6, 8, 10, 12, 20];
const MAX_DICE_HISTORY = 8;

interface DiceRoll {
  id: string;
  sides: number;
  values: number[];
  total: number;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const TABS: { id: Mode; label: string; icon: IconName }[] = [
  { id: 'dice', label: 'Dice', icon: 'dice' },
  { id: 'coin', label: 'Coin', icon: 'coins' },
  { id: 'number', label: 'Number', icon: 'function' },
  { id: 'list', label: 'List', icon: 'list-bullet' },
];

export function RandomGenerator() {
  const { back } = useRouter();
  const [mode, setMode] = useState<Mode>('dice');

  // Dice
  const [diceCount, setDiceCount] = useState(2);
  const [dieSides, setDieSides] = useState(6);
  const [diceResults, setDiceResults] = useState<number[]>([]);
  const [diceTilts, setDiceTilts] = useState<number[]>([]);
  const [showSidesSheet, setShowSidesSheet] = useState(false);
  const [diceHistory, setDiceHistory] = useState<DiceRoll[]>(() =>
    storageGet(StorageKeys.diceRollHistory, []),
  );

  useBackHandler(() => setShowSidesSheet(false), showSidesSheet);

  // Coin
  const [coinResult, setCoinResult] = useState<'heads' | 'tails' | null>(null);
  const [flipping, setFlipping] = useState(false);

  // Number
  const [minText, setMinText] = useState('1');
  const [maxText, setMaxText] = useState('100');
  const [numberResult, setNumberResult] = useState<number | null>(null);

  // List
  const [items, setItems] = useState<string[]>(() => storageGet(StorageKeys.randomLists, []));
  const [newItem, setNewItem] = useState('');
  const [winnerIndex, setWinnerIndex] = useState<number | null>(null);

  function persistItems(next: string[]) {
    setItems(next);
    storageSet(StorageKeys.randomLists, next);
  }

  function rollDice() {
    hapticTap();
    const values = Array.from({ length: diceCount }, () => randomInt(1, dieSides));
    setDiceResults(values);
    setDiceTilts(values.map(() => randomInt(-8, 8)));

    const roll: DiceRoll = { id: `${Date.now()}`, sides: dieSides, values, total: values.reduce((a, b) => a + b, 0) };
    const nextHistory = [roll, ...diceHistory].slice(0, MAX_DICE_HISTORY);
    setDiceHistory(nextHistory);
    storageSet(StorageKeys.diceRollHistory, nextHistory);
  }

  function clearDiceHistory() {
    setDiceHistory([]);
    storageSet(StorageKeys.diceRollHistory, []);
  }

  function flipCoin() {
    setFlipping(true);
    setTimeout(() => {
      setCoinResult(Math.random() < 0.5 ? 'heads' : 'tails');
      setFlipping(false);
    }, 400);
  }

  function generateNumber() {
    const min = parseInt(minText, 10);
    const max = parseInt(maxText, 10);
    if (Number.isNaN(min) || Number.isNaN(max)) return;
    // Min and Max the wrong way round still mean the same range; the button used to do nothing.
    setNumberResult(randomInt(Math.min(min, max), Math.max(min, max)));
  }

  function addItem() {
    const text = newItem.trim();
    if (!text) return;
    persistItems([...items, text]);
    setNewItem('');
    setWinnerIndex(null);
  }

  function removeItem(index: number) {
    persistItems(items.filter((_, i) => i !== index));
    setWinnerIndex(null);
  }

  function pickFromList() {
    if (items.length === 0) return;
    setWinnerIndex(randomInt(0, items.length - 1));
  }

  const headerAction = () => {
    hapticTap();
    if (mode === 'dice') rollDice();
    else if (mode === 'coin') flipCoin();
    else if (mode === 'number') generateNumber();
    else pickFromList();
  };

  return (
    <div className="screen">
      <ScreenHeader
        title="Random Generator"
        subtitle="Generate randomness for anything"
        onBack={back}
        action={
          <button type="button" className="rg__header-btn" onClick={headerAction} aria-label="Generate again">
            <Icon name="dice" size={19} />
          </button>
        }
      />

      <div className="rg__tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`rg__tab${mode === t.id ? ' rg__tab--active' : ''}`}
            onClick={() => setMode(t.id)}
          >
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {mode === 'dice' && (
        <div className="rg__body">
          <div className="rg__dice-info-row">
            <span className="rg__dice-info-icon">
              <Icon name="dice" size={20} />
            </span>
            <div className="rg__dice-info-text">
              <strong>Dice</strong>
              <span>Roll virtual dice</span>
            </div>
            <button
              type="button"
              className="rg__sides-pill"
              onClick={() => {
                hapticTap();
                setShowSidesSheet(true);
              }}
            >
              D{dieSides} (1–{dieSides})
              <Icon name="edit" size={13} />
            </button>
          </div>

          <div className="rg__stepper-row">
            <span className="rg__stepper-label">Number of dice</span>
            <div className="rg__stepper">
              <button type="button" onClick={() => setDiceCount((c) => Math.max(1, c - 1))} aria-label="Fewer dice">
                −
              </button>
              <span>{diceCount}</span>
              <button type="button" onClick={() => setDiceCount((c) => Math.min(6, c + 1))} aria-label="More dice">
                +
              </button>
            </div>
          </div>

          {diceResults.length > 0 && (
            <>
              <div className="rg__dice-row">
                {diceResults.map((value, i) => (
                  <DiceFace key={i} value={value} sides={dieSides} tilt={diceTilts[i] ?? 0} />
                ))}
              </div>
              <div className="rg__total-card">
                <span>Total</span>
                <strong>{diceResults.reduce((a, b) => a + b, 0)}</strong>
              </div>
            </>
          )}

          {diceHistory.length > 0 && (
            <div className="rg__history">
              <div className="rg__history-header">
                <span>Recent Rolls</span>
                <button type="button" onClick={clearDiceHistory}>
                  Clear
                </button>
              </div>
              <div className="rg__history-row">
                {diceHistory.map((roll, i) => (
                  <div key={roll.id} className={`rg__history-chip${i === 0 ? ' rg__history-chip--latest' : ''}`}>
                    <span>{roll.values.join(' + ')}</span>
                    <strong>= {roll.total}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button type="button" className="rg__action-btn" onClick={rollDice}>
            <Icon name="dice" size={18} />
            Roll {diceCount > 1 ? `${diceCount} Dice` : 'Dice'}
          </button>

          {showSidesSheet && (
            <div className="rg__sheet-overlay" onClick={() => setShowSidesSheet(false)}>
              <div className="rg__sheet" onClick={(e) => e.stopPropagation()}>
                <h2>Dice Type</h2>
                <div className="rg__sides-grid">
                  {DIE_TYPES.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`rg__sides-chip${dieSides === n ? ' rg__sides-chip--active' : ''}`}
                      onClick={() => {
                        hapticTap();
                        setDieSides(n);
                        // The last roll belongs to the old die: a 17 from a D20 is not a D6 face.
                        setDiceResults([]);
                        setDiceTilts([]);
                        setShowSidesSheet(false);
                      }}
                    >
                      D{n}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'coin' && (
        <div className="rg__body rg__body--center">
          <div className={`rg__coin${flipping ? ' rg__coin--flipping' : ''}`}>
            {coinResult === 'heads' ? 'H' : coinResult === 'tails' ? 'T' : '?'}
          </div>
          {coinResult && !flipping && (
            <p className="rg__coin-label">{coinResult === 'heads' ? 'Heads!' : 'Tails!'}</p>
          )}
          <button type="button" className="rg__action-btn" onClick={flipCoin} disabled={flipping}>
            Flip Coin
          </button>
        </div>
      )}

      {mode === 'number' && (
        <div className="rg__body">
          <div className="rg__range-row">
            <div className="rg__range-field">
              <label>Min</label>
              <input type="number" inputMode="numeric" value={minText} onChange={(e) => setMinText(e.target.value)} />
            </div>
            <div className="rg__range-field">
              <label>Max</label>
              <input type="number" inputMode="numeric" value={maxText} onChange={(e) => setMaxText(e.target.value)} />
            </div>
          </div>

          {numberResult !== null && <div className="rg__number-result">{numberResult}</div>}

          <button
            type="button"
            className="rg__action-btn"
            onClick={generateNumber}
            disabled={Number.isNaN(parseInt(minText, 10)) || Number.isNaN(parseInt(maxText, 10))}
          >
            Generate
          </button>
        </div>
      )}

      {mode === 'list' && (
        <div className="rg__body">
          <div className="rg__add-row">
            <input
              className="rg__add-input"
              value={newItem}
              placeholder="Add an item..."
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addItem();
              }}
            />
            <button type="button" className="rg__add-btn" onClick={addItem} aria-label="Add item">
              <Icon name="plus" size={18} />
            </button>
          </div>

          {items.length === 0 ? (
            <p className="rg__empty">Add a few items, then tap Pick to choose one at random.</p>
          ) : (
            <>
              <ul className="rg__items">
                {items.map((item, index) => (
                  <li
                    key={`${item}-${index}`}
                    className={`rg__item${winnerIndex === index ? ' rg__item--winner' : ''}`}
                  >
                    <span>{item}</span>
                    <button type="button" onClick={() => removeItem(index)} aria-label="Remove item">
                      <Icon name="x" size={14} />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="rg__action-btn" onClick={pickFromList}>
                Pick Random
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
