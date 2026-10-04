/**
 * The chart readout — the crosshair, the keyboard, and the table behind them.
 *
 * These charts were shapes for a long time: a reader could see that Tuesday was
 * taller than Monday and had no way to find out by how much. What is worth
 * pinning is not that a path renders — every one of these has rendered since
 * the file was written — but that the three ways of getting a number back out
 * of one agree with each other and with the series they were given.
 *
 * The pointer is not tested here and that is deliberate. It reads
 * `getBoundingClientRect`, which jsdom answers with zeroes, so a pointer test
 * would be a test of the stub. The keyboard walks the same `active` index
 * through the same readout, so the arithmetic under both is covered; what a
 * pointer test would add is the rect maths alone, and that is one line
 * (`(clientX - left) / width`) guarded by a `width === 0` early return.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AreaChart, Columns, Radar } from './charts';

const SERIES = [
  { values: [10, 20, 30], tone: 'violet' as const },
  { values: [5, null, 15], tone: 'green' as const },
];

const READOUT = {
  labels: ['Mon', 'Tue', 'Wed'],
  names: ['This period', 'Previous period'],
  format: (value: number) => `${value} XP`,
};

function drawChart() {
  return render(
    <AreaChart
      id="t"
      label="Test chart"
      series={SERIES}
      readout={READOUT}
      ticks={['30', '0']}
      marks={['Mon', 'Wed']}
    />,
  );
}

describe('AreaChart readout', () => {
  it('carries every point of every series in the table, gaps included', () => {
    drawChart();
    const table = screen.getByRole('table', { name: 'Test chart' });
    const rows = within(table).getAllByRole('row');
    // A header row plus one per point.
    expect(rows).toHaveLength(4);
    expect(within(rows[2]!).getByRole('rowheader')).toHaveTextContent('Tue');
    // The gap is stated rather than drawn as a zero — the whole reason
    // `AreaValue` allows null. A table that printed 0 here would assert a
    // reading that was never taken.
    expect(within(rows[2]!).getAllByRole('cell')[1]).toHaveTextContent('No reading');
    expect(within(rows[3]!).getAllByRole('cell')[1]).toHaveTextContent('15 XP');
  });

  it('says nothing until the reader asks', () => {
    const { container } = drawChart();
    expect(container.querySelector('.ax-readout')).toBeNull();
    expect(container.querySelector('[aria-live]')).toHaveTextContent('');
  });

  it('walks the points with the arrow keys, and announces each one', async () => {
    const user = userEvent.setup();
    const { container } = drawChart();

    await user.tab();
    expect(screen.getByRole('group', { name: /arrow keys/i })).toHaveFocus();

    // The first arrow lands on the first point rather than moving from one.
    await user.keyboard('{ArrowRight}');
    expect(container.querySelector('.ax-readout')).toHaveTextContent('Mon');
    expect(container.querySelector('[aria-live]')).toHaveTextContent(
      'Mon. This period: 10 XP. Previous period: 5 XP',
    );

    await user.keyboard('{ArrowRight}');
    expect(container.querySelector('[aria-live]')).toHaveTextContent(
      'Tue. This period: 20 XP. Previous period: no reading',
    );
  });

  it('stops at the ends rather than wrapping', async () => {
    const user = userEvent.setup();
    const { container } = drawChart();
    await user.tab();
    await user.keyboard('{End}');
    expect(container.querySelector('[aria-live]')).toHaveTextContent('Wed');
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(container.querySelector('[aria-live]')).toHaveTextContent('Wed');
    await user.keyboard('{Home}{ArrowLeft}');
    expect(container.querySelector('[aria-live]')).toHaveTextContent('Mon');
  });

  it('puts a marker only on the series that has a reading there', async () => {
    const user = userEvent.setup();
    const { container } = drawChart();
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(container.querySelectorAll('.ax-crosshair-dot')).toHaveLength(2);
    // Tuesday is a gap on the second series, so it gets no dot — a marker
    // sitting on the axis would read as a measured zero.
    await user.keyboard('{ArrowRight}');
    expect(container.querySelectorAll('.ax-crosshair-dot')).toHaveLength(1);
  });

  it('clears on Escape and on leaving the chart', async () => {
    const user = userEvent.setup();
    const { container } = drawChart();
    await user.tab();
    await user.keyboard('{ArrowRight}');
    await user.keyboard('{Escape}');
    expect(container.querySelector('.ax-readout')).toBeNull();

    await user.keyboard('{ArrowRight}');
    expect(container.querySelector('.ax-readout')).not.toBeNull();
    await user.tab();
    expect(container.querySelector('.ax-readout')).toBeNull();
  });

  /* The whitespace under every analytics tab. The table used to carry
     `.ax-sr` itself, and a table ignores `height: 1px` and `overflow` — it
     laid out as tall as its rows at the chart's position, and the page
     scrolled that far past its last card. A block box honours both, so the
     table goes inside one. */
  it('hides the table inside a box that can clip it, not by classing the table', () => {
    drawChart();
    const table = screen.getByRole('table', { name: 'Test chart' });
    expect(table).not.toHaveClass('ax-sr');
    expect(table.parentElement?.tagName).toBe('DIV');
    expect(table.parentElement).toHaveClass('ax-sr');
  });

  it('hides the drawing from the reader the table is for, and not otherwise', () => {
    const { container: withTable } = drawChart();
    expect(withTable.querySelector('.ax-chart-svg')).toHaveAttribute('aria-hidden', 'true');

    // No readout, no table — so the drawing has to carry its own label.
    const { container: bare } = render(
      <AreaChart id="b" label="Bare chart" series={SERIES} ticks={['1']} marks={['a']} />,
    );
    expect(bare.querySelector('.ax-chart-svg')).toHaveAttribute('aria-label', 'Bare chart');
    expect(bare.querySelector('[tabindex]')).toBeNull();
  });
});

describe('Columns', () => {
  it('is announced as one distribution rather than as loose numbers', () => {
    render(
      <Columns
        label="Tasks finished by hour"
        columns={[
          { label: '9am', value: 4, text: '4' },
          // The drawn label is thinned; the spoken one is not.
          { label: '', name: '10am', value: 7, text: '' },
        ]}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Tasks finished by hour. 9am 4, 10am 7.' }),
    ).toBeInTheDocument();
  });
});

describe('Radar', () => {
  it('is announced as what it draws, not as what the other one draws', () => {
    render(
      <Radar
        label="Five readings of Maths"
        axes={[
          { label: 'a', value: 1 },
          { label: 'b', value: 0.5 },
          { label: 'c', value: 0.2 },
        ]}
      />,
    );
    expect(screen.getByRole('img', { name: 'Five readings of Maths' })).toBeInTheDocument();
  });
});

describe('visually hidden tables, anywhere in the app', () => {
  /* The same trap, guarded for every file rather than one chart: a table
     cannot be shrunk to a pixel by its own class, only by a box around it. */
  it('never puts a visually-hidden class on a <table> itself', () => {
    const files = import.meta.glob('../../**/*.tsx', { query: '?raw', import: 'default', eager: true });
    // A glob that matched nothing would pass this vacuously.
    expect(Object.keys(files).length).toBeGreaterThan(100);
    const offenders = Object.entries(files)
      .filter(([path]) => !path.includes('.test.'))
      .filter(([, source]) => /<table\b[^>]*className=["{`][^>]*\b(ax-sr|sr-only|visually-hidden)\b/.test(String(source)))
      .map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
