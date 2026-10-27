/**
 * A small math evaluator: the skill check's calculator, and the `fn` marks a
 * problem figure plots.
 *
 * ## Why not `eval`
 *
 * A figure's `fn` comes out of the database and a calculator line comes off a
 * keyboard, and neither should be able to run code. So this parses the few
 * things a math problem needs and nothing else:
 *
 *     numbers        3, 2.5, .5, 1e-3
 *     operators      + - * / ^ and unary minus, with ^ binding tightest and
 *                    right to left (2^3^2 is 2^9), and -2^2 is -4
 *     brackets       ( )
 *     constants      pi, e, and `ans` (the last result) on the calculator
 *     functions      sqrt abs sin cos tan asin acos atan ln log exp floor ceil
 *     variables      x, when a figure plots a function
 *     extras         n! for whole n up to 170, and √ × ÷ − π typed as symbols
 *
 * Two numbers or a number and a bracket side by side multiply ("2pi", "3(4)",
 * "2x"), since that is how people write it on paper. `log` is base 10 and
 * `ln` is base e, the way a school calculator labels them.
 *
 * ## Degrees
 *
 * Trig takes and gives degrees when `degrees` is set, because a triangle
 * problem says 35° and nobody should have to convert it. Plots always use
 * radians, so sin(x) has period 2π on the axis.
 */

import { RULES } from '@/utils/sharedRules';

export interface CalcOptions {
  /** The value of `x`, for plotting. */
  x?: number;
  /** The last result, for `ans`. */
  ans?: number;
  /** Trig in degrees rather than radians. */
  degrees?: boolean;
}

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'name'; value: string }
  | { kind: 'op'; value: string };

const FUNCTIONS: Record<string, (value: number, degrees: boolean) => number> = {
  sqrt: (v) => Math.sqrt(v),
  abs: (v) => Math.abs(v),
  sin: (v, d) => Math.sin(d ? (v * Math.PI) / 180 : v),
  cos: (v, d) => Math.cos(d ? (v * Math.PI) / 180 : v),
  tan: (v, d) => Math.tan(d ? (v * Math.PI) / 180 : v),
  asin: (v, d) => (d ? (Math.asin(v) * 180) / Math.PI : Math.asin(v)),
  acos: (v, d) => (d ? (Math.acos(v) * 180) / Math.PI : Math.acos(v)),
  atan: (v, d) => (d ? (Math.atan(v) * 180) / Math.PI : Math.atan(v)),
  ln: (v) => Math.log(v),
  log: (v) => Math.log10(v),
  exp: (v) => Math.exp(v),
  floor: (v) => Math.floor(v),
  ceil: (v) => Math.ceil(v),
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

/** Every word the evaluator knows. shared/rules.json holds the list, so the
 *  server checks a figure's curves against the same words (calc.test.ts pins
 *  that each one is implemented here). */
export const CALC_WORDS: ReadonlySet<string> = new Set(RULES.problem_aids.calc_words);

/** The words implemented above, for the test that holds them to the list. */
export const IMPLEMENTED = [...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS), 'x', 'ans'];

export class CalcError extends Error {}

function tokenize(source: string): Token[] {
  const text = source
    .replace(/[−–]/g, '-')
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, ' pi ')
    .replace(/√/g, ' sqrt ')
    .toLowerCase();
  const out: Token[] = [];
  let at = 0;
  while (at < text.length) {
    const char = text.charAt(at);
    if (/\s/.test(char)) {
      at += 1;
      continue;
    }
    const number = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/.exec(text.slice(at));
    if (number) {
      out.push({ kind: 'num', value: Number(number[0]) });
      at += number[0].length;
      continue;
    }
    const word = /^[a-z]+/.exec(text.slice(at));
    if (word) {
      // "sinx" and "2pix" are read as the words they are made of, longest first.
      let rest = word[0];
      while (rest) {
        const known = [...CALC_WORDS].filter((name) => rest.startsWith(name)).sort((a, b) => b.length - a.length)[0];
        if (!known) throw new CalcError(`I don't know "${rest}".`);
        out.push({ kind: 'name', value: known });
        rest = rest.slice(known.length);
      }
      at += word[0].length;
      continue;
    }
    if ('+-*/^()!,'.includes(char)) {
      out.push({ kind: 'op', value: char });
      at += 1;
      continue;
    }
    throw new CalcError(`"${char}" isn't something I can work with.`);
  }
  return out;
}

/** A parsed expression: call it with a value of x (and the options). */
type Node = (scope: Required<CalcOptions>) => number;

function parse(tokens: Token[]): Node {
  let at = 0;
  const peek = () => tokens[at];
  const isOp = (value: string) => peek()?.kind === 'op' && peek()?.value === value;

  // A token that can start a value, for "2pi" and "3(4)".
  const startsValue = () => {
    const next = peek();
    return Boolean(next && (next.kind === 'num' || next.kind === 'name' || (next.kind === 'op' && next.value === '(')));
  };

  function sum(): Node {
    let left = product();
    while (isOp('+') || isOp('-')) {
      const op = (tokens[at++] as { value: string }).value;
      const right = product();
      const a = left;
      left = op === '+' ? (s) => a(s) + right(s) : (s) => a(s) - right(s);
    }
    return left;
  }

  function product(): Node {
    let left = unary();
    for (;;) {
      if (isOp('*') || isOp('/')) {
        const op = (tokens[at++] as { value: string }).value;
        const right = unary();
        const a = left;
        left = op === '*' ? (s) => a(s) * right(s) : (s) => a(s) / right(s);
      } else if (startsValue()) {
        const right = power();
        const a = left;
        left = (s) => a(s) * right(s);
      } else {
        return left;
      }
    }
  }

  function unary(): Node {
    if (isOp('-')) {
      at += 1;
      const inner = unary();
      return (s) => -inner(s);
    }
    if (isOp('+')) {
      at += 1;
      return unary();
    }
    return power();
  }

  function power(): Node {
    const base = postfix();
    if (isOp('^')) {
      at += 1;
      const exponent = unary();
      return (s) => Math.pow(base(s), exponent(s));
    }
    return base;
  }

  function postfix(): Node {
    let value = atom();
    while (isOp('!')) {
      at += 1;
      const inner = value;
      value = (s) => factorial(inner(s));
    }
    return value;
  }

  function atom(): Node {
    const token = tokens[at];
    if (!token) throw new CalcError('That ends too soon.');
    at += 1;
    if (token.kind === 'num') {
      const value = token.value;
      return () => value;
    }
    if (token.kind === 'op' && token.value === '(') {
      const inner = sum();
      if (!isOp(')')) throw new CalcError('A bracket is missing its pair.');
      at += 1;
      return inner;
    }
    if (token.kind === 'name') {
      const name = token.value;
      if (name in FUNCTIONS) {
        const fn = FUNCTIONS[name] as (value: number, degrees: boolean) => number;
        // sqrt 9 and sin 30 work without brackets, the way calculators take them.
        const argument = isOp('(') ? atom() : power();
        return (s) => fn(argument(s), s.degrees);
      }
      if (name === 'x') return (s) => s.x;
      if (name === 'ans') return (s) => s.ans;
      const value = CONSTANTS[name] ?? NaN;
      return () => value;
    }
    throw new CalcError(`"${token.value}" is in the wrong place.`);
  }

  const tree = sum();
  if (at < tokens.length) {
    const left = tokens[at];
    throw new CalcError(left?.kind === 'op' && left?.value === ')' ? 'A bracket is missing its pair.' : 'Something extra is on the end.');
  }
  return tree;
}

function factorial(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 170) return NaN;
  let out = 1;
  for (let n = 2; n <= value; n += 1) out *= n;
  return out;
}

/** A reusable function of x, for plotting a curve. Throws CalcError. */
export function compile(source: string): (x: number) => number {
  const tree = parse(tokenize(source));
  return (x) => tree({ x, ans: 0, degrees: false });
}

/** The value of an expression. Throws CalcError on anything it can't read. */
export function evaluate(source: string, options: CalcOptions = {}): number {
  if (!source.trim()) throw new CalcError('Type something to work out.');
  const tree = parse(tokenize(source));
  return tree({ x: options.x ?? 0, ans: options.ans ?? 0, degrees: Boolean(options.degrees) });
}

/** A result as a calculator shows it: up to 10 significant figures, no float dust. */
export function formatResult(value: number): string {
  if (Number.isNaN(value)) return 'Not a number';
  if (!Number.isFinite(value)) return value > 0 ? 'Too big' : 'Too small';
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e12 || magnitude < 1e-9) return value.toExponential(6).replace(/\.?0+e/, 'e');
  return String(Number(value.toPrecision(10)));
}
