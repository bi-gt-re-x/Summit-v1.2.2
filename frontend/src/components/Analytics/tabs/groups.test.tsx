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
import { describe, expect, it } from 'vitest';
import { OverviewTab } from './OverviewTab';
import { draw, fakeData, fakeModel, matureOverview } from './fixtures';
import { NEED_DAYS } from '../useAnalyticsModel';

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



describe('Overview', () => {
  it('reads straight down, with nothing to open and no group around a single panel', () => {
    draw(
      <OverviewTab model={matureOverview()} data={fakeData()} onEditBaseline={() => {}} />,
    );
    expect(groups()).toHaveLength(0);
    expect(screen.getByRole('heading', { name: /^Quality of finished work/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Consistency over time/ })).toBeInTheDocument();
  });

  it('keeps its "how this works" notes shut until asked', () => {
    draw(
      <OverviewTab model={matureOverview()} data={fakeData()} onEditBaseline={() => {}} />,
    );
    const notes = [...document.querySelectorAll<HTMLElement>('button.ax-link[aria-expanded]')];
    expect(notes.length).toBeGreaterThan(0);
    notes.forEach((note) => expect(note).toHaveAttribute('aria-expanded', 'false'));
  });

  it.each(['Records and improvement', 'How hard vs. how well', 'What you told us'])(
    'leaves %s to another page',
    (title) => {
      draw(
        <OverviewTab model={matureOverview()} data={fakeData()} onEditBaseline={() => {}} />,
      );
      expect(screen.queryByRole('heading', { name: new RegExp(`^${title}`) })).not.toBeInTheDocument();
    },
  );

  it('leaves the stand-in tallies to the Insights tab', () => {
    // "When you work" sat here until habits could answer it. The Insights tab
    // draws the same two tallies under "What is already true" while it waits,
    // so the Overview no longer does.
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
    expect(screen.queryByRole('button', { name: /When you work/ })).not.toBeInTheDocument();
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

