import { describe, expect, it } from 'vitest';
import { CALC_WORDS, CalcError, IMPLEMENTED, compile, evaluate, formatResult } from './calc';

describe('evaluate', () => {
  it('follows the order of operations', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('2^3^2')).toBe(512);
    expect(evaluate('-2^2')).toBe(-4);
    expect(evaluate('(2+3)!')).toBe(120);
  });

  it('multiplies things written side by side', () => {
    expect(evaluate('2pi')).toBeCloseTo(2 * Math.PI);
    expect(evaluate('3(4)')).toBe(12);
    expect(evaluate('2x^2', { x: 3 })).toBe(18);
  });

  it('does trig in degrees when asked', () => {
    expect(evaluate('sin(30)', { degrees: true })).toBeCloseTo(0.5);
    expect(evaluate('12 cos 60', { degrees: true })).toBeCloseTo(6);
    expect(evaluate('atan(1)', { degrees: true })).toBeCloseTo(45);
    expect(evaluate('sin(pi/2)')).toBeCloseTo(1);
  });

  it('reads symbols and logs the way a school calculator does', () => {
    expect(evaluate('√16 × 3 ÷ 2 − 1')).toBe(5);
    expect(evaluate('log(1000)')).toBeCloseTo(3);
    expect(evaluate('ln(e)')).toBeCloseTo(1);
    expect(evaluate('ans + 1', { ans: 41 })).toBe(42);
  });

  it('refuses what it cannot read rather than running it', () => {
    expect(() => evaluate('alert(1)')).toThrow(CalcError);
    expect(() => evaluate('(1 + 2')).toThrow(CalcError);
    expect(() => evaluate('1 + 2)')).toThrow(CalcError);
    expect(() => evaluate('3 $ 4')).toThrow(CalcError);
  });
});

describe('compile and format', () => {
  it('plots a function of x', () => {
    const f = compile('x^2 - 2x + 1');
    expect(f(1)).toBe(0);
    expect(f(3)).toBe(4);
  });

  it('trims float dust', () => {
    expect(formatResult(0.1 + 0.2)).toBe('0.3');
    expect(formatResult(1 / 0)).toBe('Too big');
  });
});

describe('the shared word list', () => {
  it('implements exactly the words shared/rules.json allows', () => {
    expect([...IMPLEMENTED].sort()).toEqual([...CALC_WORDS].sort());
  });
});
