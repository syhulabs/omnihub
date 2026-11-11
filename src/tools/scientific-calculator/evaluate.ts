export type AngleMode = 'deg' | 'rad';

const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'sqrt']);
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token = number | string;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ') {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j++;
      // A result fed back as input can be in exponent form ("5E-7"). The capital E keeps it apart
      // from the constant e, which the letter branch below handles.
      if (input[j] === 'E' && /^E[+-]?[0-9]/.test(input.slice(j, j + 3))) {
        j += input[j + 1] === '+' || input[j + 1] === '-' ? 2 : 1;
        while (j < input.length && /[0-9]/.test(input[j])) j++;
      }
      const literal = input.slice(i, j);
      // parseFloat would quietly read "1.2.3" as 1.2.
      if (!/^(\d+\.?\d*|\.\d+)(E[+-]?\d+)?$/.test(literal)) throw new Error(`Malformed number: ${literal}`);
      tokens.push(parseFloat(literal));
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let j = i;
      while (j < input.length && /[a-zA-Z]/.test(input[j])) j++;
      tokens.push(input.slice(i, j));
      i = j;
      continue;
    }
    if ('+-*/^()'.includes(ch)) {
      tokens.push(ch);
      i++;
      continue;
    }
    throw new Error(`Unexpected character: ${ch}`);
  }
  return tokens;
}

function applyFunction(name: string, arg: number, mode: AngleMode): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const toDeg = (rad: number) => (rad * 180) / Math.PI;
  // sin(180°) and cos(90°) come out as 1e-16 instead of 0 because π is not exact in binary.
  const snap = (v: number) => (Math.abs(v) < 1e-15 ? 0 : v);
  const angle = mode === 'deg' ? toRad(arg) : arg;
  switch (name) {
    case 'sin':
      return snap(Math.sin(angle));
    case 'cos':
      return snap(Math.cos(angle));
    case 'tan': {
      // tan(90°) is undefined, not sixteen quadrillion.
      if (snap(Math.cos(angle)) === 0) throw new Error('tan is undefined here');
      return snap(Math.sin(angle)) === 0 ? 0 : Math.tan(angle);
    }
    case 'asin':
      return mode === 'deg' ? toDeg(Math.asin(arg)) : Math.asin(arg);
    case 'acos':
      return mode === 'deg' ? toDeg(Math.acos(arg)) : Math.acos(arg);
    case 'atan':
      return mode === 'deg' ? toDeg(Math.atan(arg)) : Math.atan(arg);
    case 'log':
      return Math.log10(arg);
    case 'ln':
      return Math.log(arg);
    case 'sqrt':
      return Math.sqrt(arg);
    default:
      throw new Error(`Unknown function: ${name}`);
  }
}

/** True for a token that can start an operand: "2π", "2(3+4)" and "3sin(30)" mean multiplication. */
function startsOperand(tok: Token | undefined): boolean {
  if (tok === undefined) return false;
  if (typeof tok === 'number' || tok === '(') return true;
  return FUNCTIONS.has(tok) || tok in CONSTANTS;
}

/** Small recursive-descent parser/evaluator: expr -> term -> unary -> factor(^) -> primary,
 *  so that -2^2 is -(2^2) as on any calculator, and ^ is right-associative. */
export function evaluateExpression(input: string, angleMode: AngleMode): number {
  const tokens = tokenize(input);
  let pos = 0;

  const peek = () => tokens[pos];
  const advance = () => tokens[pos++];

  function parseExpression(): number {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = advance();
      const rhs = parseTerm();
      const sum = op === '+' ? value + rhs : value - rhs;
      // 0.1 + 0.2 - 0.3 leaves 5.5e-17 of binary rounding; a result that small next to its
      // operands is that residue, not an answer.
      value = Math.abs(sum) < 1e-12 * Math.max(Math.abs(value), Math.abs(rhs)) ? 0 : sum;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseUnary();
    for (;;) {
      if (peek() === '*' || peek() === '/') {
        const op = advance();
        const rhs = parseUnary();
        value = op === '*' ? value * rhs : value / rhs;
      } else if (startsOperand(peek())) {
        value *= parseUnary(); // implicit multiplication
      } else {
        return value;
      }
    }
  }

  function parseUnary(): number {
    if (peek() === '-') {
      advance();
      return -parseUnary();
    }
    if (peek() === '+') {
      advance();
      return parseUnary();
    }
    return parseFactor();
  }

  function parseFactor(): number {
    const base = parsePrimary();
    if (peek() === '^') {
      advance();
      const exponent = parseUnary();
      return Math.pow(base, exponent);
    }
    return base;
  }

  function parsePrimary(): number {
    const tok = peek();
    if (tok === undefined) throw new Error('Unexpected end of expression');
    if (tok === '(') {
      advance();
      const value = parseExpression();
      if (peek() !== ')') throw new Error('Expected )');
      advance();
      return value;
    }
    if (typeof tok === 'number') {
      advance();
      return tok;
    }
    if (typeof tok === 'string' && FUNCTIONS.has(tok)) {
      advance();
      if (peek() !== '(') throw new Error(`Expected ( after ${tok}`);
      advance();
      const arg = parseExpression();
      if (peek() !== ')') throw new Error('Expected )');
      advance();
      return applyFunction(tok, arg, angleMode);
    }
    if (typeof tok === 'string' && tok in CONSTANTS) {
      advance();
      return CONSTANTS[tok];
    }
    throw new Error(`Unexpected token: ${tok}`);
  }

  const result = parseExpression();
  if (pos < tokens.length) throw new Error('Unexpected trailing input');
  if (Number.isNaN(result)) throw new Error('Not a number');
  return result;
}
