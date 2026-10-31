/**
 * The panel the three calendar views share.
 *
 * What is worth pinning here is not that it renders — it is that the three
 * scales say the *same* things in the *same* order, because that is the whole
 * reason it exists. Three separately-written panels drifted into three
 * vocabularies once already; nothing but a test stops the next well-meant edit
 * adding a figure to the month and not the week.
 *
 * So the assertions are mostly comparisons between scales rather than checks
 * against fixed strings.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Overview, type OverviewScale } from './Overview';

function panel(scale: OverviewScale, props = {}) {
  const view = render(
    <Overview
      scale={scale}
      tasks={12}
      done={5}
      xp={1450}
      {...props}
    />,
  );
  return view;
}

/** Every tile's label, in the order they are drawn. */
function labels(): string[] {
  return [...document.querySelectorAll('.cal-tile-label')].map((el) => el.textContent ?? '');
}

describe('what every scale says', () => {
  it('draws the same two tiles, in the same order, at all three scales', () => {
    const seen: string[][] = [];
    for (const scale of ['day', 'week', 'month'] as OverviewScale[]) {
      const { unmount } = panel(scale);
      seen.push(labels());
      unmount();
    }
    expect(seen[0]).toEqual(['Tasks', 'XP earned']);
    expect(seen[1]).toEqual(seen[0]);
    expect(seen[2]).toEqual(seen[0]);
  });

  /* Tasks used to be a bare count on the Week view and a fraction on the other
     two, so the same word meant two things depending which view you were on
     and the Week made the reader do the division. */
  it('writes tasks as a fraction, not a count', () => {
    panel('week');
    const tile = document.querySelector('.cal-tile.tone-tasks')!;
    expect(within(tile as HTMLElement).getByText('5 / 12')).toBeInTheDocument();
  });

  it('groups the XP figure, so four digits are readable', () => {
    panel('day');
    expect(document.querySelector('.cal-tile.tone-xp')).toHaveTextContent('1,450');
  });
});

describe('what only the scale changes', () => {
  it('names the period in the title and in every sub-line', () => {
    const cases: [OverviewScale, string, string][] = [
      ['day', 'Today', 'today'],
      ['week', 'This week', 'this week'],
      ['month', 'This month', 'this month'],
    ];
    for (const [scale, title, when] of cases) {
      const { unmount } = panel(scale);
      expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(title);
      expect(document.querySelector('.cal-tile.tone-xp')).toHaveTextContent(when);
      expect(document.querySelector('.cal-tile.tone-tasks')).toHaveTextContent(`done ${when}`);
      unmount();
    }
  });

  it('says a period with nothing on it is empty rather than "0 done"', () => {
    panel('week', { tasks: 0, done: 0 });
    expect(document.querySelector('.cal-tile.tone-tasks')).toHaveTextContent(
      'nothing on this week',
    );
  });
});

describe('the fourth tile, which belongs to the view', () => {
  it('is drawn when the view has one', () => {
    panel('month', {
      extra: { icon: null, label: 'Best day', value: 'Aug 14', sub: '620 XP' },
    });
    expect(labels()).toEqual(['Tasks', 'XP earned', 'Best day']);
  });

  /* A day has a streak and a month does not. Three tiles has to be a working
     shape, or every view would need a fourth figure whether or not it had one
     worth showing. */
  it('is simply absent when it has not', () => {
    panel('week');
    expect(document.querySelectorAll('.cal-tile')).toHaveLength(2);
  });
});

describe('the slots around the tiles', () => {
  it('puts the lead above them and the children below', () => {
    panel('day', {
      lead: <p>the ring</p>,
      children: <p>the sparkline</p>,
    });
    const section = document.querySelector('.cal-overview')!;
    const order = [...section.children].map((el) => el.textContent);
    expect(order[0]).toContain('Today');
    expect(order[1]).toBe('the ring');
    expect(order[3]).toBe('the sparkline');
  });
});
