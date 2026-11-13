import { useMemo, useState } from 'react';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useRouter } from '../../app/Router';
import { evaluateExpression, type AngleMode } from './evaluate';
import './ScientificCalculator.css';

/** Fifteen significant digits, all a double holds exactly: hides binary rounding noise without
 *  cutting real digits (2^40 = 1099511627776) or flattening small results to 0 (rounding to ten
 *  decimal places turned 10^-11 into 0). */
function roundResult(n: number): number {
  return Number(n.toPrecision(15));
}

/** How a result is written back into the expression: plain digits, with a capital E for the
 *  exponent form JS uses for very large and very small numbers ("5E-7"), which the evaluator
 *  reads back as one number. A lowercase e there was re-read as "times the constant e". */
function toExpressionText(n: number): string {
  return String(roundResult(n)).replace('e', 'E');
}

/** Display form with thousands separators; never fed back into the expression (see equals). */
function formatResult(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  const rounded = roundResult(n);
  const magnitude = Math.abs(rounded);
  if (magnitude !== 0 && (magnitude < 1e-9 || magnitude >= 1e15)) return rounded.toExponential().replace('e', 'E');
  return rounded.toLocaleString(undefined, { maximumFractionDigits: 10 });
}

/** The expression as shown: the keys say π, × and ÷, so the display does too. */
function displayExpression(expression: string): string {
  return expression.replace(/pi/g, 'π').replace(/\*/g, '×').replace(/\//g, '÷');
}

export function ScientificCalculator() {
  const { back } = useRouter();
  const [expression, setExpression] = useState('');
  const [angleMode, setAngleMode] = useState<AngleMode>('deg');

  const preview = useMemo(() => {
    if (!expression.trim()) return null;
    try {
      return formatResult(evaluateExpression(expression, angleMode));
    } catch {
      return null;
    }
  }, [expression, angleMode]);

  function insert(text: string) {
    // Typing after an error starts fresh instead of producing "Error5".
    setExpression((prev) => (prev === 'Error' ? text : prev + text));
  }

  function clear() {
    setExpression('');
  }

  function backspace() {
    // "Error" is a state, not text to edit: one backspace clears it instead of leaving "Erro".
    setExpression((prev) => (prev === 'Error' ? '' : prev.endsWith('pi') ? prev.slice(0, -2) : prev.slice(0, -1)));
  }

  function equals() {
    if (!expression.trim()) return;
    try {
      const result = evaluateExpression(expression, angleMode);
      // Plain digits only: a locale-formatted "2,000" would not parse as the next input.
      setExpression(Number.isFinite(result) ? toExpressionText(result) : 'Error');
    } catch {
      setExpression('Error');
    }
  }

  const FUNCTION_KEYS = ['sin', 'cos', 'tan', 'log', 'ln', 'sqrt'];

  return (
    <div className="screen">
      <ScreenHeader title="Scientific Calculator" onBack={back} />

      <div className="sci__body">
        <div className="sci__display">
          <div className="sci__expression">{displayExpression(expression) || '0'}</div>
          {preview !== null && <div className="sci__preview">= {preview}</div>}
        </div>

        <div className="sci__mode-row">
          <button
            type="button"
            className={`sci__mode-btn${angleMode === 'deg' ? ' sci__mode-btn--active' : ''}`}
            onClick={() => setAngleMode('deg')}
          >
            DEG
          </button>
          <button
            type="button"
            className={`sci__mode-btn${angleMode === 'rad' ? ' sci__mode-btn--active' : ''}`}
            onClick={() => setAngleMode('rad')}
          >
            RAD
          </button>
        </div>

        <div className="sci__grid">
          {FUNCTION_KEYS.map((fn) => (
            <button key={fn} type="button" className="sci__key sci__key--fn" onClick={() => insert(`${fn}(`)}>
              {fn}
            </button>
          ))}

          <button type="button" className="sci__key sci__key--fn" onClick={() => insert('(')}>
            (
          </button>
          <button type="button" className="sci__key sci__key--fn" onClick={() => insert(')')}>
            )
          </button>
          <button type="button" className="sci__key sci__key--fn" onClick={() => insert('pi')}>
            π
          </button>
          <button type="button" className="sci__key sci__key--fn" onClick={() => insert('e')}>
            e
          </button>
          <button type="button" className="sci__key sci__key--fn" onClick={() => insert('^')}>
            x^y
          </button>
          <button type="button" className="sci__key sci__key--danger" onClick={clear}>
            AC
          </button>

          <button type="button" className="sci__key" onClick={() => insert('7')}>
            7
          </button>
          <button type="button" className="sci__key" onClick={() => insert('8')}>
            8
          </button>
          <button type="button" className="sci__key" onClick={() => insert('9')}>
            9
          </button>
          <button type="button" className="sci__key sci__key--op" onClick={() => insert('/')}>
            ÷
          </button>

          <button type="button" className="sci__key" onClick={() => insert('4')}>
            4
          </button>
          <button type="button" className="sci__key" onClick={() => insert('5')}>
            5
          </button>
          <button type="button" className="sci__key" onClick={() => insert('6')}>
            6
          </button>
          <button type="button" className="sci__key sci__key--op" onClick={() => insert('*')}>
            ×
          </button>

          <button type="button" className="sci__key" onClick={() => insert('1')}>
            1
          </button>
          <button type="button" className="sci__key" onClick={() => insert('2')}>
            2
          </button>
          <button type="button" className="sci__key" onClick={() => insert('3')}>
            3
          </button>
          <button type="button" className="sci__key sci__key--op" onClick={() => insert('-')}>
            −
          </button>

          <button type="button" className="sci__key" onClick={() => insert('0')}>
            0
          </button>
          <button type="button" className="sci__key" onClick={() => insert('.')}>
            .
          </button>
          <button type="button" className="sci__key sci__key--danger" onClick={backspace}>
            ⌫
          </button>
          <button type="button" className="sci__key sci__key--op" onClick={() => insert('+')}>
            +
          </button>

          <button type="button" className="sci__key sci__key--equals sci__key--span4" onClick={equals}>
            =
          </button>
        </div>
      </div>
    </div>
  );
}
