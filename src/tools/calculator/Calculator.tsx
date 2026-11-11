import { useState } from 'react';
import { useBackHandler } from '../../app/useBackHandler';
import { Icon } from '../../components/Icon';
import { useRouter } from '../../app/Router';
import { storageGet, storageSet, StorageKeys } from '../../storage/db';
import { applyOperator, formatResult, type Operator, type CalculatorHistoryEntry } from './logic';
import { NumberScanner } from './NumberScanner';
import './Calculator.css';

const MAX_HISTORY = 50;

export function Calculator() {
  const { back } = useRouter();
  const [display, setDisplay] = useState('0');
  const [storedValue, setStoredValue] = useState<number | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [waitingForNewValue, setWaitingForNewValue] = useState(false);
  const [expression, setExpression] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  // Hardware back closes an open sheet or panel instead of leaving the tool.
  useBackHandler(() => setShowHistory(false), showHistory);
  const [history, setHistory] = useState<CalculatorHistoryEntry[]>(() =>
    storageGet(StorageKeys.calculatorHistory, []),
  );

  function saveHistory(next: CalculatorHistoryEntry[]) {
    setHistory(next);
    storageSet(StorageKeys.calculatorHistory, next);
  }

  function inputDigit(digit: string) {
    if (waitingForNewValue || display === '0') {
      setDisplay(digit === '.' ? '0.' : digit);
      setWaitingForNewValue(false);
    } else if (digit === '.' && display.includes('.')) {
      return;
    } else {
      setDisplay(display + digit);
    }
  }

  function clearAll() {
    setDisplay('0');
    setStoredValue(null);
    setOperator(null);
    setWaitingForNewValue(false);
    setExpression('');
  }

  function toggleSign() {
    setDisplay((d) => (d === 'Error' ? '0' : d.startsWith('-') ? d.slice(1) : d.length && d !== '0' ? `-${d}` : d));
  }

  function inputPercent() {
    if (display === 'Error') {
      setDisplay('0');
      return;
    }
    const value = parseFloat(display);
    // As on a phone's own calculator: after + or -, the percentage is of the first number
    // (200 + 10 % = 220), otherwise it is a plain hundredth (200 x 10 % = 20).
    const relative = storedValue !== null && (operator === '+' || operator === '-') && !waitingForNewValue;
    setDisplay(formatResult(relative ? (storedValue * value) / 100 : value / 100));
  }

  function backspace() {
    setDisplay((d) => {
      if (d === 'Error' || d.length <= 1) return '0';
      const next = d.slice(0, -1);
      // "-5" must not become a bare "-", which then evaluates to Error.
      return next === '-' || next === '-0' ? '0' : next;
    });
  }

  function chooseOperator(nextOp: Operator) {
    if (display === 'Error') {
      clearAll();
      return;
    }
    const current = parseFloat(display);
    if (storedValue !== null && operator && !waitingForNewValue) {
      const result = applyOperator(storedValue, current, operator);
      setStoredValue(result);
      setDisplay(formatResult(result));
      setExpression(`${formatResult(result)} ${nextOp}`);
    } else {
      setStoredValue(current);
      setExpression(`${formatResult(current)} ${nextOp}`);
    }
    setOperator(nextOp);
    setWaitingForNewValue(true);
  }

  function evaluate() {
    if (operator === null || storedValue === null) return;
    const current = parseFloat(display);
    const result = applyOperator(storedValue, current, operator);
    const resultText = formatResult(result);
    const fullExpression = `${expression} ${formatResult(current)}`;

    const entry: CalculatorHistoryEntry = {
      id: `${Date.now()}`,
      expression: fullExpression,
      result: resultText,
      timestamp: Date.now(),
    };
    saveHistory([entry, ...history].slice(0, MAX_HISTORY));

    setDisplay(resultText);
    setStoredValue(null);
    setOperator(null);
    setWaitingForNewValue(true);
    setExpression('');
  }

  function clearHistory() {
    saveHistory([]);
  }

  function useScanResult(value: number) {
    setDisplay(formatResult(value));
    setStoredValue(null);
    setOperator(null);
    setWaitingForNewValue(true);
    setExpression('');
    setShowScanner(false);
  }

  function applyHistoryResult(entry: CalculatorHistoryEntry) {
    setDisplay(entry.result);
    setStoredValue(null);
    setOperator(null);
    setWaitingForNewValue(true);
    setExpression('');
    setShowHistory(false);
  }

  if (showScanner) {
    return <NumberScanner onUseResult={useScanResult} onClose={() => setShowScanner(false)} />;
  }

  return (
    <div className="screen calc-screen">
      <div className="calc__topbar">
        <button type="button" className="calc__icon-btn" onClick={back} aria-label="Back">
          <Icon name="back" size={22} />
        </button>
        <div className="calc__topbar-actions">
          <button
            type="button"
            className="calc__icon-btn"
            onClick={() => setShowScanner(true)}
            aria-label="Scan numbers"
          >
            <Icon name="scan" size={20} />
          </button>
          <button
            type="button"
            className="calc__icon-btn"
            onClick={() => setShowHistory((v) => !v)}
            aria-label="Toggle history"
          >
            <Icon name={showHistory ? 'x' : 'history'} size={20} />
          </button>
        </div>
      </div>

      {showHistory ? (
        <div className="calc__history">
          {history.length === 0 ? (
            <p className="calc__empty">No calculations yet.</p>
          ) : (
            <>
              <ul className="calc__history-list">
                {history.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      className="calc__history-item"
                      onClick={() => applyHistoryResult(entry)}
                    >
                      <span className="calc__history-expr">{entry.expression} =</span>
                      <span className="calc__history-result">{entry.result}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="calc__clear-history" onClick={clearHistory}>
                Clear History
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="calc__display">
            <div className="calc__expression">{expression || ' '}</div>
            <div className="calc__value">{display}</div>
          </div>

          <div className="calc__pad">
            <button type="button" className="calc__key calc__key--clear" onClick={clearAll}>
              AC
            </button>
            <button type="button" className="calc__key calc__key--fn" onClick={toggleSign}>
              ±
            </button>
            <button type="button" className="calc__key calc__key--fn" onClick={inputPercent}>
              %
            </button>
            <button
              type="button"
              className="calc__key calc__key--op"
              onClick={() => chooseOperator('÷')}
            >
              ÷
            </button>

            {['7', '8', '9'].map((d) => (
              <button key={d} type="button" className="calc__key" onClick={() => inputDigit(d)}>
                {d}
              </button>
            ))}
            <button type="button" className="calc__key calc__key--op" onClick={() => chooseOperator('×')}>
              ×
            </button>

            {['4', '5', '6'].map((d) => (
              <button key={d} type="button" className="calc__key" onClick={() => inputDigit(d)}>
                {d}
              </button>
            ))}
            <button type="button" className="calc__key calc__key--op" onClick={() => chooseOperator('-')}>
              −
            </button>

            {['1', '2', '3'].map((d) => (
              <button key={d} type="button" className="calc__key" onClick={() => inputDigit(d)}>
                {d}
              </button>
            ))}
            <button type="button" className="calc__key calc__key--op" onClick={() => chooseOperator('+')}>
              +
            </button>

            <button type="button" className="calc__key" onClick={backspace} aria-label="Backspace">
              <Icon name="backspace" size={20} />
            </button>
            <button type="button" className="calc__key" onClick={() => inputDigit('0')}>
              0
            </button>
            <button type="button" className="calc__key" onClick={() => inputDigit('.')}>
              .
            </button>
            <button type="button" className="calc__key calc__key--eq" onClick={evaluate}>
              =
            </button>
          </div>
        </>
      )}
    </div>
  );
}
