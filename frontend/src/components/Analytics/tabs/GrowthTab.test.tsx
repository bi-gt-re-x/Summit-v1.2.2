/**
 * The Growth tab: the period half.
 *
 * Everything on this tab is a *pair* — a period and the equivalent period
 * before it — and most of what can go wrong is a pair that has quietly become
 * one figure. So these hold four things:
 *
 *   * the period row is the control and the summary at once, and a period with
 *     nothing before it says so rather than printing a growth figure;
 *   * "biggest improvement" is ranked on points moved, not on percentage, so a
 *     metric climbing 4 → 12 cannot outrank a month's real work;
 *   * a movement smaller than `HELD` is reported as held, in both directions;
 *   * nothing on the tab invents a comparison when `previous` is null.
 *
 * The scoring itself is not tested here and cannot be: it is
 * `backend/tracking/analytics.py`, and tests/test_report_card.py is where it is
 * pinned. This suite feeds the tab a response and checks what it says about it.
 *
 * The year-on-year half lives in ../GrowthYears.test.tsx.
 */
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { draw, fakeModel } from './fixtures';
import type { GrowthPeriods, MetricScores, PeriodSide } from '@/services/analytics';

vi.mock('@/hooks', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks')>()),
  useStats: () => ({ username: 'tester', stats: null }),
}));

vi.mock('@/services', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/services')>();
  return { ...real, analytics: { ...real.analytics, growthPeriods: vi.fn() } };
});

const { analytics: analyticsService } = await import('@/services');
const growthPeriods = vi.mocked(analyticsService.growthPeriods);

const { GrowthTab } = await import('./GrowthTab');

// --------------------------------------------------------------------------
const scores = (over: Partial<MetricScores> = {}): MetricScores => ({
  productivity: 50, quality: 50, consistency: 50, efficiency: 50, focus: 50, ...over,
});

/**
 * One side of a comparison.
 *
 * `figures` matters as much as `parts` here: the tab prints the measured
 * quantity under every score, and "what changed" is assembled *only* from
 * these, so a fixture whose two sides share them produces a tab with nothing
 * to say. `moved` is what makes the two sides differ.
 */
function side(parts: MetricScores, overall: number, moved = 0): PeriodSide {
  return {
    overall,
    grade: 'C',
    parts,
    grades: {
      productivity: 'C', quality: 'C', consistency: 'C', efficiency: 'C', focus: 'C',
    },
    figures: {
      productivity: { avg_daily_xp: 200 + moved * 40 },
      quality: {
        basis: 'ratings', avg_quality: 12.5 + moved, max_quality: 25, rated_tasks: 40,
        total_tasks: 60, avg_difficulty: 3.4, avg_execution: 3.6,
      },
      consistency: { active_days: 20 + moved * 2, total_days: 30, rate: 67 },
      efficiency: { on_time_pct: 70 + moved * 5, has_timing: true, avg_minutes: 42 },
      focus: { focused_minutes: 600 + moved * 90, goal_minutes: 900, pct_of_goal: 67 },
    },
  };
}

function payload(over: Partial<GrowthPeriods> = {}): GrowthPeriods {
  const now = scores({ efficiency: 80, focus: 62 });
  const then = scores({ efficiency: 60, focus: 58 });
  return {
    period: '30d',
    label: 'Last 30 days',
    start: '2026-08-06',
    end: '2026-09-04',
    days: 30,
    trend_window: 7,
    current: side(now, 58, 1),
    previous: side(then, 54, 0),
    change: {
      overall: 7.4, productivity: 0, quality: 0, consistency: 0,
      efficiency: 33.3, focus: 6.9,
    },
    series: [
      { date: '2026-08-06', overall: 54, ...then },
      { date: '2026-08-20', overall: 56, ...scores({ efficiency: 70, focus: 60 }) },
      { date: '2026-09-04', overall: 58, ...now },
    ],
    periods: [
      { key: '7d', label: 'Last 7 days', days: 7, overall: 60, previous: 55, change: 9.1, partial: false , spark: [50, 52, 51, 55, 58, 57, 60, 62, 61, 64, 66, 68] },
      { key: '30d', label: 'Last 30 days', days: 30, overall: 58, previous: 54, change: 7.4, partial: false , spark: [50, 52, 51, 55, 58, 57, 60, 62, 61, 64, 66, 68] },
      { key: '90d', label: 'Last 3 months', days: 90, overall: 55, previous: 57, change: -3.5, partial: false , spark: [50, 52, 51, 55, 58, 57, 60, 62, 61, 64, 66, 68] },
      { key: '180d', label: 'Last 6 months', days: 180, overall: 54, previous: 54, change: 0, partial: false , spark: [50, 52, 51, 55, 58, 57, 60, 62, 61, 64, 66, 68] },
      { key: '365d', label: 'Last year', days: 365, overall: 52, previous: 48, change: 8.3, partial: false , spark: [50, 52, 51, 55, 58, 57, 60, 62, 61, 64, 66, 68] },
      { key: 'all', label: 'Since you started', days: 900, overall: 50, previous: null, change: null, partial: false , spark: [50, 52, 51, 55, 58, 57, 60, 62, 61, 64, 66, 68] },
    ],
    ...over,
  };
}

const serve = (data: GrowthPeriods = payload()) =>
  growthPeriods.mockResolvedValue({ success: true, ...data } as never);

beforeEach(() => {
  growthPeriods.mockReset();
});

// --------------------------------------------------------------------------
describe('the period row', () => {
  it('offers every period as a control that states its own growth', async () => {
    serve();
    draw(<GrowthTab model={fakeModel()} />);

    const row = await screen.findByRole('navigation', { name: /Growth by period/i });
    const buttons = within(row).getAllByRole('button');
    expect(buttons).toHaveLength(6);
    // The control and the summary are one object: pressing it is worth doing
    // because of the figure printed on it.
    expect(within(row).getByText('+9.1%')).toBeInTheDocument();
    expect(within(row).getByText('−3.5%')).toBeInTheDocument();
  });

  it('marks the open period pressed in both controls, and no other', async () => {
    // The segmented control in the chart head and the row of cards at the foot
    // are two ways of asking the same question, so they cannot disagree about
    // which period is open.
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    const row = await screen.findByRole('navigation', { name: /Growth by period/i });
    const tabs = screen.getByRole('group', { name: /Growth period/i });

    for (const control of [row, tabs]) {
      const pressed = within(control)
        .getAllByRole('button')
        .filter((button) => button.getAttribute('aria-pressed') === 'true');
      expect(pressed).toHaveLength(1);
    }
    expect(within(tabs).getByRole('button', { pressed: true }).textContent).toBe('Month');
  });

  it('asks the server again when a different period is pressed', async () => {
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    const row = await screen.findByRole('navigation', { name: /Growth by period/i });

    await userEvent.click(within(row).getByRole('button', { name: /Last year/ }));
    expect(growthPeriods).toHaveBeenCalledWith('365d');
  });

  it('drives the same fetch from the segmented control', async () => {
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    const tabs = await screen.findByRole('group', { name: /Growth period/i });
    await userEvent.click(within(tabs).getByRole('button', { name: 'Week' }));
    expect(growthPeriods).toHaveBeenCalledWith('7d');
  });

  it('falls back to points moved where there is no percentage of nothing', async () => {
    /* A score that went 0 -> 44 grew by an undefined share of zero, so the
       backend sends null rather than inventing +100%. A dash in 52px type is
       the one reading of that movement which says nothing, so the tab states
       it in the units the scores are already in. */
    serve(payload({
      periods: payload().periods.map((card) =>
        card.key === '7d' ? { ...card, previous: 0, overall: 44, change: null } : card),
    }));
    draw(<GrowthTab model={fakeModel()} />);
    const row = await screen.findByRole('navigation', { name: /Growth by period/i });
    expect(within(row).getByText('+44 pts')).toBeInTheDocument();
  });

  it('says a period has nothing before it rather than printing a growth figure', async () => {
    // "Since you started" reaches back to the first day by definition, so there
    // is no earlier equivalent. A "+100%" here would mean "we had no idea".
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    const row = await screen.findByRole('navigation', { name: /Growth by period/i });
    const all = within(row).getByRole('button', { name: /Since you started/ });
    expect(all.textContent).toContain('—');
    expect(all.textContent).toContain('nothing before it');
  });
});

describe('the metric strip', () => {
  it('states overall growth in the biggest type, with the grade move under it', async () => {
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    // Scoped to the strip: the 30-day period card states the same figure,
    // which is the point of the row and not a duplicate to be deduplicated.
    await screen.findByRole('heading', { name: /Growth timeline/ });
    const overall = document.querySelector('.ax-gp-overall') as HTMLElement;
    expect(within(overall).getByText('+7.4%').className).toContain('ax-gp-big');
    expect(overall.textContent).toContain('You moved from');
  });

  it('puts the five terms of the mean beside the mean', async () => {
    /* The overall figure is the mean of the five and nothing else. A layout
       that gave it a block of its own and buried the parts further down would
       ask the reader to take the headline on trust. */
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    const cards = await screen.findAllByText(
      /^(Productivity|Quality|Consistency|Efficiency|Focus)$/);
    const inStrip = cards.filter((node) => node.closest('.ax-gp-metric-card'));
    expect(inStrip).toHaveLength(5);
  });

  it('shows each metric as a grade transition as well as a percentage', async () => {
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    await screen.findByRole('heading', { name: /Growth timeline/ });
    const strip = document.querySelector('.ax-gp-strip') as HTMLElement;
    expect(strip.querySelectorAll('.ax-gp-metric-card-grade')).toHaveLength(5);
  });

  it('says so plainly when there is nothing to compare to', async () => {
    serve(payload({ previous: null, change: {
      overall: null, productivity: null, quality: null,
      consistency: null, efficiency: null, focus: null,
    } }));
    draw(<GrowthTab model={fakeModel()} />);

    await screen.findByRole('heading', { name: /Growth timeline/ });
    const overall = document.querySelector('.ax-gp-overall') as HTMLElement;
    expect(overall.textContent).toMatch(/reaches back to your first day/i);
  });
});

describe('the movers', () => {
  it('names the metric that moved furthest each way', async () => {
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    const best = (await screen.findByRole('heading', { name: /Biggest improvement/ }))
      .closest('.ax-panel') as HTMLElement;
    expect(within(best).getByText('Efficiency')).toBeInTheDocument();
  });

  it('ranks on points moved, not on percentage', async () => {
    /* The trap. A metric going 2 → 8 is "+300%" and is a rounding error on a
       measure that was barely registering; one going 60 → 80 is "+33%" and is
       the reader's month. Ranking on the percentage puts the noise on top. */
    serve(payload({
      current: side(scores({ productivity: 8, efficiency: 80 }), 58),
      previous: side(scores({ productivity: 2, efficiency: 60 }), 54),
      change: {
        overall: 7.4, productivity: 300, quality: 0,
        consistency: 0, efficiency: 33.3, focus: 0,
      },
    }));
    draw(<GrowthTab model={fakeModel()} />);

    const best = (await screen.findByRole('heading', { name: /Biggest improvement/ }))
      .closest('.ax-panel') as HTMLElement;
    expect(within(best).getByText('Efficiency')).toBeInTheDocument();
    expect(within(best).queryByText('Productivity')).toBeNull();
  });

  it('says nothing moved rather than promoting a wobble', async () => {
    // Everything inside the threshold in `HELD`, which is the window sliding
    // rather than the reader changing.
    const flat = scores();
    serve(payload({
      current: side(flat, 50),
      previous: side(scores({ efficiency: 52 }), 50),
      change: {
        overall: 0, productivity: 0, quality: 0, consistency: 0, efficiency: -3.8, focus: 0,
      },
    }));
    draw(<GrowthTab model={fakeModel()} />);
    expect(await screen.findByText(/No big gains/i))
      .toBeInTheDocument();
    expect(screen.getByText(/No big drops/i)).toBeInTheDocument();
  });

  it('falls back to a measure rather than drawing an empty panel', async () => {
    /* A steady period has no biggest riser and a good one has nothing that
       fell, and the first version printed one sentence into a card the height
       of the one beside it. On an account doing well that is a large empty
       rectangle most of the time, which reads as something failing to load. */
    serve(payload({
      current: side(scores({ quality: 41, productivity: 88 }), 50),
      previous: side(scores({ quality: 40, productivity: 87 }), 50),
      change: {
        overall: 0, productivity: 1.1, quality: 2.5, consistency: 0, efficiency: 0, focus: 0,
      },
    }));
    draw(<GrowthTab model={fakeModel()} />);

    const worst = (await screen.findByRole('heading', { name: /Needs attention/ }))
      .closest('.ax-panel') as HTMLElement;
    // The lowest measure, named, with its own quantities under it.
    expect(within(worst).getByText('Quality')).toBeInTheDocument();
    expect(worst.querySelectorAll('.ax-gp-parts li').length).toBeGreaterThan(1);
  });

  it('does not call a fallback a decline', async () => {
    // "Your lowest score" and "what fell" are different claims, and only one
    // of them is a criticism.
    serve(payload({
      current: side(scores(), 50),
      previous: side(scores(), 50),
      change: {
        overall: 0, productivity: 0, quality: 0, consistency: 0, efficiency: 0, focus: 0,
      },
    }));
    draw(<GrowthTab model={fakeModel()} />);
    const worst = (await screen.findByRole('heading', { name: /Needs attention/ }))
      .closest('.ax-panel') as HTMLElement;
    expect(worst.textContent).toMatch(/not a claim that anything got worse/i);
  });

  it('gives every measure more than one quantity to be checked against', async () => {
    // A metric that reports a single number gives a reader nothing to check
    // the score against, and left the panel two-thirds empty.
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    const best = (await screen.findByRole('heading', { name: /Biggest improvement/ }))
      .closest('.ax-panel') as HTMLElement;
    expect(best.querySelectorAll('.ax-gp-parts li').length).toBeGreaterThan(1);
  });
});

describe('then and now', () => {
  it('prints every metric before and after, in the units it was measured in', async () => {
    serve();
    draw(<GrowthTab model={fakeModel()} />);

    const rows = await screen.findByRole('heading', { name: /^Then and now$/ });
    const panel = rows.closest('.ax-panel') as HTMLElement;
    expect(panel.querySelectorAll('.ax-gp-metric')).toHaveLength(5);
    // The score is a position on a scale nobody designed; the quantity is what
    // actually happened, so both are on the row.
    expect(within(panel).getAllByText(/22 of 30 days worked/).length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/11\.5 hrs of a 15\.0 hr goal/).length).toBeGreaterThan(0);
  });

  it('says which basis a quality score came from rather than assuming ratings', async () => {
    const unrated = side(scores(), 50);
    unrated.figures.quality = { basis: 'xp', avg_task_xp: 30, rated_tasks: 0, total_tasks: 12 };
    serve(payload({ current: unrated, previous: null, change: {
      overall: null, productivity: null, quality: null,
      consistency: null, efficiency: null, focus: null,
    } }));
    draw(<GrowthTab model={fakeModel()} />);
    expect(await screen.findByText(/no ratings yet — scored on task XP/)).toBeInTheDocument();
  });
});

describe('what changed', () => {
  it('names the quantities rather than restating the scores', async () => {
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    // Assembled from the figures, so it cannot drift from them. The metric
    // rows print the same quantity, so this looks only at the prose block.
    const list = (await screen.findByRole('heading', { name: /^What changed underneath$/ }))
      .closest('.ax-panel')!
      .querySelector('.ax-gp-changes');
    expect(list).not.toBeNull();
    expect(list!.textContent).toContain('% of tasks by their deadline');
    expect(list!.textContent).toContain('XP a working day');
  });

  it('draws nothing to compare when there is no previous period', async () => {
    serve(payload({ previous: null, change: {
      overall: null, productivity: null, quality: null,
      consistency: null, efficiency: null, focus: null,
    } }));
    draw(<GrowthTab model={fakeModel()} />);
    expect(await screen.findByText(/nothing before it to have changed from/i))
      .toBeInTheDocument();
  });
});

describe('the chart', () => {
  it('opens on the four graded measures, with the mean left off', async () => {
    // Overall is the mean of the lines already drawn, so showing it by default
    // adds a line that says nothing the others do not. It is one press away.
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    const on = await screen.findAllByRole('button', { pressed: true });
    const toggles = on.filter((button) => button.className.includes('ax-gp-toggle'));
    expect(toggles.map((button) => button.textContent))
      .toEqual(['Productivity', 'Quality', 'Consistency', 'Efficiency']);
    expect(document.querySelectorAll('.ax-gp-line')).toHaveLength(4);
  });

  it('adds a line when its metric is switched on', async () => {
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Overall' }));
    expect(document.querySelectorAll('.ax-gp-line')).toHaveLength(5);
  });

  it('refuses to be emptied', async () => {
    // An empty chart box reads as a chart that broke rather than as one the
    // reader emptied.
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    // Awaited, not read straight off: the tab fetches, so the toggles are not
    // in the document on the tick after `draw`.
    await screen.findByRole('button', { name: 'Productivity' });
    for (const name of ['Productivity', 'Quality', 'Consistency', 'Efficiency']) {
      await userEvent.click(screen.getByRole('button', { name }));
    }
    expect(document.querySelectorAll('.ax-gp-line')).toHaveLength(1);
  });

  it('marks every point, so a reading is not guessed off the line', async () => {
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    await screen.findByRole('heading', { name: /Growth timeline/ });
    expect(document.querySelectorAll('.ax-gp-point')).toHaveLength(4);
  });

  it('labels where each line ends', async () => {
    serve();
    draw(<GrowthTab model={fakeModel()} />);
    const ends = (await screen.findByRole('heading', { name: /Growth timeline/ }))
      .closest('.ax-panel')!
      .querySelectorAll('.ax-gp-end');
    expect(ends).toHaveLength(4);
  });
});
