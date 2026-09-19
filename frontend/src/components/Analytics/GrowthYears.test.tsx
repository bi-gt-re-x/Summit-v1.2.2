/**
 * The year-on-year reading: its gate, its table, and the claim at the top of it.
 *
 * The arithmetic is pinned in utils/growthYears.test.ts — this is about what
 * the component does with it. Four things are worth holding here:
 *
 *   * the gate counts *years*, not days, because no number of days inside one
 *     calendar year produces a second one to compare against;
 *   * a partial year is drawn and labelled rather than dropped or quietly
 *     shown as a decline;
 *   * the verdict block prints *both* ratings at the same size, because the
 *     pair is the claim and a block that led on the flattering one would be
 *     the thing this reading exists to avoid;
 *   * the ratings chart marks every year, because a year here is one reading
 *     rather than a sample of something continuous.
 *
 * This used to be the whole Growth tab. It is now the folded half at the foot
 * of it — see tabs/GrowthTab.test.tsx for the period half that replaced it.
 */
import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { YearOnYear } from './GrowthYears';
import { draw, fakeModel } from './tabs/fixtures';
import type { GrowthDay, Task } from '@/types';

const day = (date: string, over: Partial<GrowthDay> = {}): GrowthDay =>
  ({
    date, day_number: 1, xp_earned: 0, tasks_completed: 0, cumulative_xp: 0,
    avg_task_xp: 0, focus_minutes: 0, cumulative_focus_minutes: 0,
    rated_tasks: 0, quality_score: 0, avg_difficulty: 0, avg_execution: 0,
    ...over,
  }) as GrowthDay;

function year(y: number, opts: { from?: number; to?: number; tasks?: number; xp?: number } = {}) {
  const days: GrowthDay[] = [];
  for (let n = opts.from ?? 1; n <= (opts.to ?? 366); n += 1) {
    const at = new Date(Date.UTC(y, 0, n));
    if (at.getUTCFullYear() !== y) break;
    days.push(day(at.toISOString().slice(0, 10), {
      tasks_completed: opts.tasks ?? 0,
      xp_earned: opts.xp ?? 0,
    }));
  }
  return days;
}

/** Integer ratings mixed to land on the means given. */
function rated(y: number, count: number, difficulty: number, execution: number): Task[] {
  const split = (t: number) => ({ low: Math.floor(t), highs: Math.round((t - Math.floor(t)) * count) });
  const d = split(difficulty);
  const e = split(execution);
  return Array.from({ length: count }, (_, i) => ({
    id: `${y}-${i}`, title: 't', status: 'done',
    completed_at: `${y}-06-15T12:00:00`,
    difficulty: i < d.highs ? d.low + 1 : d.low,
    execution: i < e.highs ? e.low + 1 : e.low,
  }) as unknown as Task);
}

const model = (all: GrowthDay[], tasks: Task[] = []) => fakeModel({ all, tasks });

describe('the gate', () => {
  it('refuses on a single year, however much is in it', () => {
    // A whole busy year is still one row, and one row is not a comparison.
    draw(<YearOnYear model={model(year(2025, { tasks: 5, xp: 50 }), rated(2025, 400, 3, 4))} />);
    expect(screen.getByText(/need two calendar years of data/i)).toBeInTheDocument();
    expect(document.querySelector('.ax-gy')).toBeNull();
  });

  it('does not count a year the account sat out toward the two', () => {
    const all = [...year(2024, { tasks: 2 }), ...year(2025)];
    draw(<YearOnYear model={model(all)} />);
    expect(screen.getByText(/need two calendar years of data/i)).toBeInTheDocument();
  });

  it('opens once two years have work in them', () => {
    const all = [...year(2024, { tasks: 2 }), ...year(2025, { tasks: 3 })];
    draw(<YearOnYear model={model(all)} />);
    expect(screen.queryByText(/needs two years/i)).not.toBeInTheDocument();
    expect(document.querySelector('.ax-gy')).not.toBeNull();
  });
});

describe('the table', () => {
  const all = [
    ...year(2023, { from: 200, tasks: 1, xp: 10 }), // joined mid-year
    ...year(2024, { tasks: 2, xp: 20 }),
    ...year(2025, { to: 120, tasks: 3, xp: 30 }), // still running
  ];

  it('draws a row per year the account has been present for', () => {
    draw(<YearOnYear model={model(all)} />);
    const rows = document.querySelectorAll('.ax-gy tbody tr');
    expect(rows).toHaveLength(3);
    expect([...rows].map((r) => r.querySelector('th')?.textContent)).toEqual([
      '2023part year', '2024', '2025part year',
    ]);
  });

  it('marks the first and last years partial and no others', () => {
    draw(<YearOnYear model={model(all)} />);
    expect(screen.getAllByText('part year')).toHaveLength(2);
  });

  it('sets a year with nothing rated as a dash, never a zero', () => {
    // Zero would draw as "rated badly" on a year nobody answered for.
    draw(<YearOnYear model={model(all)} />);
    const row = document.querySelectorAll('.ax-gy tbody tr')[1] as HTMLElement;
    const cells = [...row.querySelectorAll('td')].map((c) => c.textContent);
    expect(cells.slice(-2)).toEqual(['—', '—']);
  });

  it('sets back a year the account was present for and did nothing in', () => {
    const quiet = [...year(2023, { tasks: 1 }), ...year(2024), ...year(2025, { tasks: 1 })];
    draw(<YearOnYear model={model(quiet)} />);
    const rows = [...document.querySelectorAll('.ax-gy tbody tr')];
    expect(rows[1]!.className).toContain('is-quiet');
    expect(rows[0]!.className).not.toContain('is-quiet');
  });
});

describe('the headline', () => {
  it('states the arc, naming both ratings', () => {
    const all = [...year(2024, { tasks: 2 }), ...year(2025, { tasks: 2 })];
    const tasks = [...rated(2024, 60, 3, 2.8), ...rated(2025, 60, 3, 3.7)];
    draw(<YearOnYear model={model(all, tasks)} />);

    const lead = document.querySelector('.ax-gy-lead') as HTMLElement;
    expect(lead).not.toBeNull();
    expect(lead.textContent).toMatch(/with difficulty steady/);
    // Both figures, not just the flattering one.
    expect(lead.textContent).toMatch(/2\.8 to 3\.7/);
    expect(lead.textContent).toMatch(/3\.0/);
  });

  it('says plainly when a rising score came with easier work', () => {
    const all = [...year(2024, { tasks: 2 }), ...year(2025, { tasks: 2 })];
    const tasks = [...rated(2024, 60, 4.2, 2.6), ...rated(2025, 60, 3, 3.6)];
    draw(<YearOnYear model={model(all, tasks)} />);
    expect(document.querySelector('.ax-gy-lead')!.textContent)
      .toMatch(/Some of that rise is easier work/);
  });

  it('draws no headline at all when nothing is rated', () => {
    // The table still stands — volume is a fact — but the claim needs ratings
    // and the tab does not invent one.
    const all = [...year(2024, { tasks: 2 }), ...year(2025, { tasks: 2 })];
    draw(<YearOnYear model={model(all)} />);
    expect(document.querySelector('.ax-gy-lead')).toBeNull();
    expect(document.querySelector('.ax-gy')).not.toBeNull();
  });
});

describe('the ratings chart', () => {
  const all = [...year(2023, { tasks: 2 }), ...year(2024, { tasks: 2 }), ...year(2025, { tasks: 2 })];
  const tasks = [
    ...rated(2023, 40, 3, 2.8), ...rated(2024, 40, 3, 3.2), ...rated(2025, 40, 3, 3.7),
  ];

  it('draws execution and difficulty as two lines on one box', () => {
    draw(<YearOnYear model={model(all, tasks)} />);
    // One filled area (execution) and two lines; difficulty is unfilled,
    // because two washes on one box leave a band belonging to neither.
    expect(document.querySelectorAll('.ax-chart-line')).toHaveLength(2);
    expect(document.querySelectorAll('.ax-chart-area')).toHaveLength(1);
    expect(document.querySelectorAll('.ax-chart-line.is-muted')).toHaveLength(1);
  });

  it('pins the axis to the five points a rating actually has', () => {
    // Left to scale itself the box would run 0 to 3.7 here, which draws a
    // five-point scale as a three-point one and exaggerates every wobble in
    // the flat line — the line whose flatness is the whole claim.
    draw(<YearOnYear model={model(all, tasks)} />);
    const ticks = [...document.querySelectorAll('.ax-chart-y span')].map((t) => t.textContent);
    expect(ticks).toEqual(['5', '4', '3', '2', '1', '0']);
    // The top tick is real: nothing is drawn above four fifths of the height.
    const d = document.querySelector('.ax-chart-line')!.getAttribute('d')!;
    const ys = [...d.matchAll(/,([\d.]+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeGreaterThan(0);
  });

  it('marks one point per rated year, in order', () => {
    draw(<YearOnYear model={model(all, tasks)} />);
    expect([...document.querySelectorAll('.ax-chart-x span')].map((m) => m.textContent))
      .toEqual(['2023', '2024', '2025']);
  });

  it('says so rather than drawing an empty box on one rated year', () => {
    const thin = [...rated(2025, 40, 3, 3.7)];
    draw(<YearOnYear model={model(all, thin)} />);
    expect(document.querySelector('.ax-chart')).toBeNull();
    expect(screen.getByText(/Two years with ratings on them draws this/)).toBeInTheDocument();
  });

  it('warns that the two lines are not a race', () => {
    // They share an axis because both are out of five, but they answer
    // different questions, so which sits higher means nothing.
    draw(<YearOnYear model={model(all, tasks)} />);
    expect(screen.getByRole('button', { name: /Reading this/ })).toBeInTheDocument();
  });
});

describe('the standing panel', () => {
  it('keeps the percentile the Records tab was carrying', () => {
    const all = [...year(2024, { tasks: 2, xp: 20 }), ...year(2025, { tasks: 3, xp: 40 })];
    draw(<YearOnYear model={model(all)} />);
    expect(screen.getByRole('heading', { name: /Where this month sits/i })).toBeInTheDocument();
    expect(screen.getByText(/Your best 30/)).toBeInTheDocument();
  });

  it('compares a partial year on a rate, not on a total', () => {
    // The trap: a four-month year has a smaller total than the year before it
    // and that is not a decline. The tile row says so in per-working-day terms.
    const all = [...year(2024, { tasks: 3 }), ...year(2025, { to: 120, tasks: 3 })];
    draw(<YearOnYear model={model(all)} />);
    const tiles = document.querySelector('.ax-tiles') as HTMLElement;
    expect(within(tiles).getByText('Tasks a working day')).toBeInTheDocument();
    // Same rate at both ends, so the note reports no fall.
    expect(within(tiles).getByText('3.0 in 2024')).toBeInTheDocument();
  });
});

describe('the verdict', () => {
  const all = [...year(2024, { tasks: 2 }), ...year(2025, { tasks: 2 })];
  const better = [...rated(2024, 60, 3, 2.8), ...rated(2025, 60, 3, 3.7)];

  it('states the finding in the biggest type on the tab', () => {
    draw(<YearOnYear model={model(all, better)} />);
    expect(document.querySelector('.ax-gy-headline')!.textContent)
      .toBe('You got better at the work');
  });

  it('prints both ratings as then-and-now, at the same size', () => {
    // The pair is the claim. A block that set the rising figure large and the
    // steady one as a footnote would be flattery, which is the one thing this
    // tab is built to refuse — so there are two `.ax-gy-move`s and they draw
    // from the same rules.
    draw(<YearOnYear model={model(all, better)} />);
    const moves = [...document.querySelectorAll('.ax-gy-move')];
    expect(moves).toHaveLength(2);
    expect(moves.map((m) => m.querySelector('.ax-gy-was')!.textContent)).toEqual(['2.8', '3.0']);
    expect(moves.map((m) => m.querySelector('.ax-gy-now')!.textContent)).toEqual(['3.7', '3.0']);
  });

  it('reports a drift under the threshold as level, never as a rise', () => {
    // Both rows are integers somebody picks after finishing a task, so a
    // year's mean moving a tenth is the population changing and not the
    // reader. `+0.0` printed as a gain would invite the opposite reading.
    draw(<YearOnYear model={model(all, better)} />);
    const notes = [...document.querySelectorAll('.ax-gy-move-note')].map((n) => n.textContent);
    expect(notes[0]).toBe('+0.9 on the five-point scale');
    expect(notes[1]).toBe('held level');
  });

  it('colours the block by which way the news runs', () => {
    // Execution up on easier work is not good news, however well the figure
    // reads on its own, and the block does not paint it as though it were.
    const flattered = [...rated(2024, 60, 4.2, 2.6), ...rated(2025, 60, 3, 3.6)];
    draw(<YearOnYear model={model(all, flattered)} />);
    expect(document.querySelector('.ax-gy-verdict')!.className).toContain('ax-tone-amber');
  });

  it('draws nothing at all when the record cannot support a claim', () => {
    draw(<YearOnYear model={model(all)} />);
    expect(document.querySelector('.ax-gy-verdict')).toBeNull();
    expect(document.querySelector('.ax-gy-headline')).toBeNull();
  });
});
