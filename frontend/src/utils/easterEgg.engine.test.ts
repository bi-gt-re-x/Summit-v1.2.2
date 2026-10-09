/**
 * /engine and the vault behind it, run as the plain scripts they are
 * (frontend/secret/engine.js, hidden-engine.js).
 *
 * An account that already held a title used to skip the second half of the
 * chain: /engine let it in without the day's unlock, the vault opened by
 * itself, and the vault's console put SUMMIT CORE a click away. These pin
 * that nobody skips — the core is reached from the ADMIN ROOM, at the end.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DAY = '2026-08-30';

function run(file: string) {
  new Function(readFileSync(`frontend/secret/${file}`, 'utf8'))();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${DAY}T21:00:00`));
  localStorage.clear();
  localStorage.setItem('currentUser', 'myles');
  localStorage.setItem('summitTitle:myles', 'Admin');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a title is no shortcut', () => {
  it('does not let a title-holder into /engine without today’s unlock', () => {
    run('engine.js');
    expect(document.getElementById('summitEngine')).toBeNull();
  });

  it('opens nothing by itself, and the door still says ENGINE SETTINGS', () => {
    localStorage.setItem(`easterEgg:myles:${DAY}`, '1');
    run('hidden-engine.js');
    run('engine.js');
    expect(document.getElementById('summitEngine')).not.toBeNull();
    expect(document.querySelector('.eng-settings-text')?.textContent).toBe('ENGINE SETTINGS');

    vi.advanceTimersByTime(5000);
    expect(document.getElementById('hiddenEngine')).toBeNull();
  });

  it('keeps the vault’s console shut to a title-holder', () => {
    run('hidden-engine.js');
    (window as unknown as { SummitHiddenEngine: { reveal: () => void } }).SummitHiddenEngine.reveal();

    expect(document.querySelector('#heConsole button')).toBeNull();
    expect(document.getElementById('heConsoleLine')?.textContent).toBe('Awaiting Administrator...');

    (document.getElementById('heConsole') as HTMLElement).click();
    expect(document.getElementById('summitCore')).toBeNull();
    expect(document.getElementById('heConsoleLine')?.textContent).toBe('Administrator credentials required.');
  });
});
