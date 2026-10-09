/**
 * One colour and a fade — components/Spaces/fill.
 */
import { describe, expect, it } from 'vitest';
import { FILL_STYLES, cleanFill, fillBackground, hexToHsv, hsvToHex, inkOn, readHex, turn } from './fill';

describe('colours', () => {
  it('read a hex as typed, with or without "#", short or long', () => {
    expect(readHex('#ABCDEF')).toBe('#abcdef');
    expect(readHex('abc')).toBe('#aabbcc');
    expect(readHex('#12')).toBeNull();
    expect(readHex('zzzzzz')).toBeNull();
  });

  it('go to HSV and back unchanged', () => {
    for (const hex of ['#000000', '#ffffff', '#ff0000', '#93c5fd', '#fde68a', '#475569']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });

  it('turn the hue and keep it in range', () => {
    expect(turn('#ff0000', 120)).toBe('#00ff00');
    expect(turn('#ff0000', -120)).toBe('#0000ff');
  });

  it('pick words that read on the fill', () => {
    expect(inkOn({ color: '#111827', style: 'solid' })).toBe('#ffffff');
    expect(inkOn({ color: '#fde68a', style: 'solid' })).toBe('#1f2328');
  });
});

describe('fills', () => {
  it('draw every style from the one colour', () => {
    expect(fillBackground({ color: '#93c5fd', style: 'solid' })).toBe('#93c5fd');
    for (const style of FILL_STYLES.filter((one) => one !== 'solid')) {
      expect(fillBackground({ color: '#93c5fd', style })).toMatch(/gradient/);
    }
  });

  it('keep only a fill this page knows', () => {
    expect(cleanFill({ color: '#ABCDEF', style: 'aurora' })).toEqual({ color: '#abcdef', style: 'aurora' });
    expect(cleanFill({ color: '#abcdef', style: 'plaid' })).toEqual({ color: '#abcdef', style: 'solid' });
    expect(cleanFill({ color: 'red', style: 'fade' })).toBeNull();
    expect(cleanFill(null)).toBeNull();
  });
});
