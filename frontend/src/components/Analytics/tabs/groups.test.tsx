/**
 * The detail groups on Overview, Habits and Goals — that they are there, that
 * they start in the right state, and that they actually open and shut.
 *
 * Three tabs were flat runs of equal-weight panels: Overview carried four rows
 * of follow-up under its answer, Habits ran a card per habit, a year-long
 * calendar, two charts and a whole embedded chapter, and Goals put three more
 * rows under its pace map. They are `PanelGroup`s now, the same disclosure
 * Insights has used since it had fifteen panels in eight rows.
 *
 * `PanelGroup`'s own mechanics are pinned in ../disclosure.test.tsx — that a
 * shut group is `inert` and not merely invisible, and that its title is a real
 * heading. This file asserts the thing that file cannot: which groups each tab
 * puts up, which of them opens on arrival, and that a click moves them.
 *
 * The panels inside are deliberately not asserted on. What belongs in a group
 * is an editorial call that will keep changing; that the reader can open and
 * shut it is the contract.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { GoalsTab } from './GoalsTab';
import { HabitsTab } from './HabitsTab';
import { OverviewTab } from './OverviewTab';
import { draw, fakeData, fakeModel, nameOf, subjects } from './fixtures';
import { NEED_DAYS } from '../useAnalyticsModel';
import { buildHabits, habitSummary } from '@/utils/habits';
import { summaryFigures } from '@/utils/growthSummary';
import { task } from '@/test/factories';

/**
 * The group heads, and only those.
 *
 * `aria-expanded` alone is not enough to find them: `PanelNote` — the "How this
 * is calculated ↓" toggle inside a panel — is a disclosure too, and a mature
 * Overview draws three of them. Those are a footnote opening inside one panel;
 * these are the row of panels itself. `.ax-group-head` is the class only
 * `PanelGroup` writes.
 */
function groups(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('button.ax-group-head')];
}

function groupNamed(name: RegExp): HTMLElement {
  const found = groups().find((b) => name.test(b.textContent ?? ''));
  if (!found) throw new Error(`no group matching ${name} — saw ${groups().map((b) => b.textContent)}`);
  return found;
}

/** The body a disclosure button controls. */
function bodyOf(head: HTMLElement): HTMLElement {
  const body = head.closest('.ax-group')?.querySelector<HTMLElement>('.ax-group-body');
  if (!body) throw new Error('group has no body');
  return body;
}

/**
 * A mature account: past every gate, with quality, tallies and extras on.
 *
 * `maturity.stage` is 'full' so OverviewTab takes its long branch rather than
 * the Collecting one, which is the branch the groups live on.
 */
function matureOverview() {
  return fakeModel({
    historyDays: 400,
    maturity: {
      stage: 'full',
      activeDays: 120,
      spanDays: 400,
      next: null,
      toNext: null,
      progress: 1,
      lastActive: '2026-08-01',
      /* Current, so the away notice stays off this fixture — it is about the
         panel groups, not about somebody who stopped. */
      quietDays: 0,
    },
    detail: { quality: true, tallies: true, extras: true, rows: 12 },
    logStyle: 'tasks',
    showStanding: true,
    /* From the real builder over an empty slice, for the reason ./fixtures
       gives: `Tiles` reads eight fields off this and a hand-written three
       fails on the fourth. */
    figures: summaryFigures({ current: [], previous: [] }),
    rhythmRate: { rate: 0.5, previousRate: 0.4, bestMonth: null },
    card: { value: 8, factors: [] },
    score: 8,
    scoreLine: [],
    scoreMarks: [],
    heatRows: [],
    sparks: { xp: [], tasks: [], focusHours: [], consistency: [], quality: [] },
    ratingRows: [],
    ratingBands: [],
    ratingGrid: [],
    compareLabel: 'the 90 days before',
    previousSpanText: 'the 90 days before',
    grain: 'weekly',
    metric: 'tasks',
    fromIso: '2026-05-01',
  });
}

describe('Overview', () => {
  it('folds its follow-up into groups and leaves the answer above them open', () => {
    draw(
      <OverviewTab model={matureOverview()} data={fakeData()} onEditBaseline={() => {}} />,
    );
    // The rows that used to run flat under the trajectory.
    expect(groupNamed(/Quality/)).toBeInTheDocument();
    expect(groupNamed(/Consistency and standing/)).toBeInTheDocument();
    expect(groupNamed(/Subjects and findings/)).toBeInTheDocument();

    // All shut on arrival: the tab's answer is the screen above them.
    groups().forEach((head) => {
      expect(head).toHaveAttribute('aria-expanded', 'false');
      expect(bodyOf(head)).toHaveAttribute('inert');
    });
  });

  it('opens a group on a click and shuts it again on the next', async () => {
    draw(
      <OverviewTab model={matureOverview()} data={fakeData()} onEditBaseline={() => {}} />,
    );
    const head = groupNamed(/Consistency and standing/);

    await userEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    expect(bodyOf(head)).not.toHaveAttribute('inert');

    await userEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(bodyOf(head)).toHaveAttribute('inert');
  });

  it('folds the stand-in tallies too, while Habits is still locked', () => {
    // `When you work` is on the Overview only until the Habits tab can answer
    // the same question properly — so it needs an account short of that gate,
    // not the mature one the other cases use.
    draw(
      <OverviewTab
        model={fakeModel({
          ...matureOverview(),
          historyDays: NEED_DAYS.habits - 1,
          waitFor: () => 1,
        })}
        data={fakeData()}
        onEditBaseline={() => {}}
      />,
    );
    const head = groupNamed(/When you work/);
    expect(head).toHaveAttribute('aria-expanded', 'false');
    expect(bodyOf(head)).toHaveAttribute('inert');
  });

  it('leaves the trajectory out of every group, because Summary links to it', () => {
    // Three of Summary's rows point at "#trajectory". An anchor that lands on
    // a collapsed section is a link that appears to do nothing.
    const { container } = draw(
      <OverviewTab model={matureOverview()} data={fakeData()} onEditBaseline={() => {}} />,
    );
    const trajectory = container.querySelector('#trajectory');
    expect(trajectory).not.toBeNull();
    expect(trajectory!.closest('.ax-group-body')).toBeNull();
  });
});

describe('Habits', () => {
  function withHabits() {
    const repeating = Array.from({ length: 8 }, (_, week) =>
      task({
        title: 'Revision',
        status: 'done',
        completed_at: `2026-0${week < 4 ? 6 : 7}-${String(1 + (week % 4) * 7).padStart(2, '0')}T18:00:00`,
      }),
    );
    const habits = buildHabits(repeating, nameOf, '2026-06-01', '2026-07-31');
    return fakeModel({
      historyDays: NEED_DAYS.habits,
      habits,
      summary: habitSummary(habits, []),
    });
  }

  it('opens on the habits themselves and folds the three layers under them', () => {
    draw(<HabitsTab model={withHabits()} subjects={subjects} />);

    const yours = groupNamed(/Your habits/);
    expect(yours).toHaveAttribute('aria-expanded', 'true');
    expect(bodyOf(yours)).not.toHaveAttribute('inert');

    // The three that answer a question the reader only has once they have read
    // the first one.
    [/Every day you worked/, /Holding or slipping/, /Can you execute it reliably/].forEach(
      (name) => {
        const head = groupNamed(name);
        expect(head).toHaveAttribute('aria-expanded', 'false');
        expect(bodyOf(head)).toHaveAttribute('inert');
      },
    );
  });

  it('opens the embedded focus chapter on request', async () => {
    draw(<HabitsTab model={withHabits()} subjects={subjects} />);
    const head = groupNamed(/Can you execute it reliably/);
    await userEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded', 'true');
    expect(bodyOf(head)).not.toHaveAttribute('inert');
  });

  it('keeps the two group titles that used to be section headings', () => {
    // "Your habits" and "Can you execute it reliably" were <h2 class="ax-band">
    // before. A reader scanning for either should still find it.
    draw(<HabitsTab model={withHabits()} subjects={subjects} />);
    expect(screen.getByRole('heading', { name: /Your habits/ })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Can you execute it reliably/ }),
    ).toBeInTheDocument();
  });
});

describe('Goals', () => {
  it('folds the three rows under the pace map, all shut', () => {
    draw(<GoalsTab model={fakeModel()} />);
    [/What you have reached/, /Pace and notes/, /What to aim at next/].forEach((name) => {
      const head = groupNamed(name);
      expect(head).toHaveAttribute('aria-expanded', 'false');
      expect(bodyOf(head)).toHaveAttribute('inert');
    });
  });

  it('opens and shuts each of them independently', async () => {
    draw(<GoalsTab model={fakeModel()} />);
    const reached = groupNamed(/What you have reached/);
    const pace = groupNamed(/Pace and notes/);

    await userEvent.click(reached);
    expect(reached).toHaveAttribute('aria-expanded', 'true');
    // Opening one does not touch the others — these are not an accordion.
    expect(pace).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(pace);
    expect(reached).toHaveAttribute('aria-expanded', 'true');
    expect(pace).toHaveAttribute('aria-expanded', 'true');
  });
});
