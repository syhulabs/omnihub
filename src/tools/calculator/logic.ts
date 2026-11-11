export type Operator = '+' | '-' | '×' | '÷';

/** 0.1 + 0.2 - 0.3 leaves 5.5e-17 of binary rounding; a sum that small next to its operands is that
 *  residue, not an answer. */
function settle(sum: number, a: number, b: number): number {
  return Math.abs(sum) < 1e-12 * Math.max(Math.abs(a), Math.abs(b)) ? 0 : sum;
}

export function applyOperator(a: number, b: number, op: Operator): number {
  switch (op) {
    case '+':
      return settle(a + b, a, b);
    case '-':
      return settle(a - b, a, b);
    case '×':
      return a * b;
    case '÷':
      return b === 0 ? NaN : a / b;
  }
}

export function formatResult(value: number): string {
  if (Number.isNaN(value)) return 'Error';
  if (!Number.isFinite(value)) return 'Error';
  // Twelve significant digits. Rounding to ten decimal places kept binary noise on large sums
  // (2500000.55 + 1000000.4 showed 3500000.9499999997) and flattened small results to 0.
  return Number(value.toPrecision(12)).toString();
}

export interface CalculatorHistoryEntry {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
}
