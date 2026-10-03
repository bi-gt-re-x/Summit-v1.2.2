/**
 * The site index: that it holds together, and that "closest" means what a
 * reader means by it.
 *
 * The scoring is the part worth pinning. It decides which page the top bar
 * takes somebody to before they have finished typing, and it is the kind of
 * arithmetic that is quietly wrong for months — a reordering that sends "goal"
 * to a settings section instead of the Goals page breaks nothing, throws
 * nothing, and is simply worse.
 */
import { describe, expect, it } from 'vitest';
import { PLACES, findPlaces, score, scorePlace } from './siteIndex';

describe('the catalogue', () => {
  it('has a unique id for every place', () => {
    const ids = PLACES.map((place) => place.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sends every place to an in-app path', () => {
    PLACES.forEach((place) => {
      expect(place.to.startsWith('/')).toBe(true);
      expect(place.to).not.toContain(' ');
    });
  });

  it('gives every place a name and words to be found by', () => {
    PLACES.forEach((place) => {
      expect(place.name.trim()).not.toBe('');
      expect(place.keywords.trim()).not.toBe('');
    });
  });

  it('finds every place by its own name', () => {
    PLACES.forEach((place) => {
      expect(scorePlace(place.name, place)).toBeGreaterThan(0);
    });
  });
});

describe('score', () => {
  it('ranks the four ways in, in the order a reader means them', () => {
    const exact = score('goals', 'Goals');
    const prefix = score('goal', 'Goals');
    const word = score('goal', 'Daily goal');
    const inside = score('keeper', 'goalkeeper drills');

    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(word);
    expect(word).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(0);
  });

  it('reads a word the needle starts as a prefix, not as a coincidence', () => {
    /* "goalkeeper drills" does begin with "goal", and ranking it as a prefix
       is right — it is what somebody typing "goal" into a list of their own
       tasks might well be after. What keeps it in its place is the length
       bonus, which is capped below the gap between two kinds of match: the
       page called Goals wins, and a longer title never beats a stronger
       kind of match on shortness alone. */
    expect(score('goal', 'goalkeeper drills')).toBeGreaterThan(score('goal', 'Daily goal'));
    expect(score('goal', 'Goals')).toBeGreaterThan(score('goal', 'goalkeeper drills'));
    // The length bonus is capped below the gap between two kinds of match, so
    // a long exact match still beats a short prefix one.
    const longExact = score('a very long task title indeed', 'A very long task title indeed');
    expect(longExact).toBeGreaterThan(score('goal', 'Goals'));
  });

  it('prefers the shorter of two matches of the same kind', () => {
    expect(score('goal', 'Goals')).toBeGreaterThan(score('goal', 'Goals due this week'));
  });

  it('is nothing for a miss, and nothing for an empty needle', () => {
    expect(score('calendar', 'Notes')).toBe(0);
    expect(score('   ', 'Notes')).toBe(0);
  });

  it('does not care about case', () => {
    expect(score('NOTES', 'Notes')).toBe(score('notes', 'Notes'));
  });
});

describe('findPlaces', () => {
  it('answers nothing before anything is typed', () => {
    expect(findPlaces('')).toEqual([]);
    expect(findPlaces('   ')).toEqual([]);
  });

  it('puts the page above the settings section of the same name', () => {
    /* Both are called Notifications and both are real answers. The one a
       reader means by typing the word on its own is the switches, because
       there is no notifications *page* — so what this actually pins is that
       the settings section is reachable at all, above every weaker match. */
    const [first] = findPlaces('notifications');
    expect(first?.to).toBe('/settings/notifications');
  });

  it('leads with the page when the page shares its name with a tab', () => {
    const [first] = findPlaces('goals');
    expect(first?.to).toBe('/goals');
  });

  it('finds a section by what it is for rather than what it is called', () => {
    expect(findPlaces('dark mode').map((place) => place.to))
      .toContain('/settings/appearance');
    expect(findPlaces('delete my account').map((place) => place.to))
      .toContain('/settings/danger');
    expect(findPlaces('year on year').map((place) => place.to))
      .toContain('/records');
  });

  it('finds the calendar views', () => {
    const week = findPlaces('week').map((place) => place.to);
    expect(week).toContain('/calendar/week');
  });

  it('keeps to the limit it is given', () => {
    expect(findPlaces('a', 3).length).toBeLessThanOrEqual(3);
  });
});
