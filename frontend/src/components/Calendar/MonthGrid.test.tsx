/**
 * Reaching the month grid with a keyboard, and dropping something on it.
 *
 * Both of these are behaviour a screenshot cannot check and a click-through
 * will not find, and both replaced something that was quietly wrong.
 *
 * **The tab stops.** Every one of the forty-two cells carried `tabIndex={0}`,
 * so a keyboard reader tabbing past the calendar pressed Tab forty-two times,
 * and once inside had no way to move except more of them. A grid is one stop
 * with the arrows working inside it. That is a property of the whole grid
 * rather than of any cell, which is exactly the kind of thing that gets
 * reintroduced by a well-meant edit to one cell.
 *
 * **The drop.** The month view could not accept one at all. What it means here
 * is narrower than the Week view's drag and is the whole point: the date
 * changes and the clock times do not.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MonthGrid } from './MonthGrid';
import type { MonthDay } from '@/utils/monthSummary';

/** August 2026: a Saturday-start month, so the leading blanks are real. */
const YEAR = 2026;
const MONTH = 7;

function day(key: string, day_: number): MonthDay {
  return {
    key,
    iso: `2026-08-${String(day_).padStart(2, '0')}`,
    day: day_,
    family: null,
    events: 2,
    xp: 120,
    earned: 60,
    tasks: 2,
    done: 1,
    settled: false,
    marks: [],
  };
}

const DAYS: MonthDay[] = [day('2026-8-6', 6), day('2026-8-7', 7), day('2026-8-14', 14)];

function grid(props: Partial<React.ComponentProps<typeof MonthGrid>> = {}) {
  const onSelect = vi.fn();
  const onSelectOther = vi.fn();
  const onStep = vi.fn();
  const onDropDay = vi.fn();
  const view = render(
    <MonthGrid
      year={YEAR}
      month={MONTH}
      selectedKey="2026-8-6"
      days={DAYS}
      onStep={onStep}
      onToday={vi.fn()}
      onSelect={onSelect}
      onSelectOther={onSelectOther}
      {...props}
    />,
  );
  return { view, onSelect, onSelectOther, onStep, onDropDay };
}

/** The cell for a store key, by the attribute the grid navigates itself with. */
function cell(key: string): HTMLElement {
  const found = document.querySelector<HTMLElement>(`[data-date="${key}"]`);
  if (!found) throw new Error(`no cell for ${key}`);
  return found;
}

describe('the month grid as a keyboard target', () => {
  it('is one tab stop, not forty-two', () => {
    grid();
    const stops = [...document.querySelectorAll('.mv-cell')].filter(
      (el) => el.getAttribute('tabindex') === '0',
    );
    expect(stops).toHaveLength(1);
    // And it is the day the panel beside it is already describing, so coming
    // back to the grid comes back to where the reader was.
    expect(stops[0]).toBe(cell('2026-8-6'));
  });

  it('falls back to a real day when nothing is selected', () => {
    grid({ selectedKey: null });
    const stops = [...document.querySelectorAll('.mv-cell')].filter(
      (el) => el.getAttribute('tabindex') === '0',
    );
    expect(stops).toHaveLength(1);
    // A day of *this* month — never one of the greyed corners, which are
    // context and are not in the tab order at all.
    expect(stops[0]).not.toHaveClass('is-outside');
  });

  it('moves a day with the left and right arrows', async () => {
    const user = userEvent.setup();
    const { onSelect } = grid();

    cell('2026-8-6').focus();
    await user.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenLastCalledWith('2026-8-7');

    await user.keyboard('{ArrowLeft}');
    expect(onSelect).toHaveBeenLastCalledWith('2026-8-5');
  });

  it('moves a week with the up and down arrows', async () => {
    const user = userEvent.setup();
    const { onSelect } = grid();

    cell('2026-8-14').focus();
    await user.keyboard('{ArrowDown}');
    expect(onSelect).toHaveBeenLastCalledWith('2026-8-21');

    await user.keyboard('{ArrowUp}');
    expect(onSelect).toHaveBeenLastCalledWith('2026-8-7');
  });

  /**
   * The last day of a month and the first of the next are neighbours in the
   * year, so they have to be neighbours here. Stepping off the end goes
   * through `onSelectOther`, which is the call that moves the grid as well as
   * the selection — `onSelect` alone would select a day the grid is not
   * showing.
   */
  it('steps the month when an arrow leaves it', async () => {
    const user = userEvent.setup();
    const { onSelect, onSelectOther } = grid({ selectedKey: '2026-8-31' });

    cell('2026-8-31').focus();
    await user.keyboard('{ArrowRight}');

    expect(onSelect).not.toHaveBeenCalled();
    expect(onSelectOther).toHaveBeenCalledTimes(1);
    const to = onSelectOther.mock.calls[0]![0] as Date;
    expect(to.getMonth()).toBe(8);
    expect(to.getDate()).toBe(1);
  });

  it('goes to the ends of the week with Home and End', async () => {
    const user = userEvent.setup();
    // Monday-first, so the week holding Thursday the 6th runs the 3rd to 9th.
    const { onSelect } = grid({ weekStart: 1 });

    cell('2026-8-6').focus();
    await user.keyboard('{Home}');
    expect(onSelect).toHaveBeenLastCalledWith('2026-8-3');

    cell('2026-8-6').focus();
    await user.keyboard('{End}');
    expect(onSelect).toHaveBeenLastCalledWith('2026-8-9');
  });

  it('pages the month with PageUp and PageDown', async () => {
    const user = userEvent.setup();
    const { onStep } = grid();

    cell('2026-8-6').focus();
    await user.keyboard('{PageDown}');
    expect(onStep).toHaveBeenLastCalledWith(1);

    await user.keyboard('{PageUp}');
    expect(onStep).toHaveBeenLastCalledWith(-1);
  });

  it('still selects on Enter, for anyone who expects it to', async () => {
    const user = userEvent.setup();
    const { onSelect } = grid();

    cell('2026-8-14').focus();
    await user.keyboard('{Enter}');
    expect(onSelect).toHaveBeenLastCalledWith('2026-8-14');
  });
});

describe('the month grid as a drop target', () => {
  it('takes a drop on a day and says which one', () => {
    const onDropDay = vi.fn();
    render(
      <MonthGrid
        year={YEAR}
        month={MONTH}
        selectedKey="2026-8-6"
        days={DAYS}
        onStep={vi.fn()}
        onToday={vi.fn()}
        onSelect={vi.fn()}
        onSelectOther={vi.fn()}
        onDropDay={onDropDay}
        dropping
      />,
    );

    const target = cell('2026-8-14');
    const data = { getData: () => '', dropEffect: '', effectAllowed: '' };
    // dragOver has to be accepted, or the browser refuses the drop before the
    // reader has let go of it.
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(over, 'dataTransfer', { value: data });
    target.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);

    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: data });
    target.dispatchEvent(drop);

    expect(onDropDay).toHaveBeenCalledTimes(1);
    const on = onDropDay.mock.calls[0]![0] as Date;
    expect(on.getMonth()).toBe(MONTH);
    expect(on.getDate()).toBe(14);
  });

  /**
   * A grid with nothing draggable behind it must not advertise itself as a
   * target. The Week and Day views do not pass `onDropDay`, and a cell that
   * accepted a drop and did nothing with it is worse than one that refuses.
   */
  it('is not a target when the view offers no drag', () => {
    grid();
    const target = cell('2026-8-14');
    const over = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(over, 'dataTransfer', { value: { dropEffect: '' } });
    target.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
  });

  it('takes a drop on a day of a neighbouring month', () => {
    const onDropDay = vi.fn();
    render(
      <MonthGrid
        year={YEAR}
        month={MONTH}
        selectedKey="2026-8-6"
        days={DAYS}
        onStep={vi.fn()}
        onToday={vi.fn()}
        onSelect={vi.fn()}
        onSelectOther={vi.fn()}
        onDropDay={onDropDay}
        dropping
      />,
    );

    const outside = document.querySelector<HTMLElement>('.mv-cell.is-outside');
    expect(outside).not.toBeNull();
    const drop = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(drop, 'dataTransfer', { value: { getData: () => '' } });
    outside!.dispatchEvent(drop);

    expect(onDropDay).toHaveBeenCalledTimes(1);
  });
});

describe('the month grid as a day picker', () => {
  /* The keyboard's half of the move. The grid does not know what it is holding
     — only that it is holding something — so what is tested here is that it
     says so, that it can be let go of, and that picking a day still comes out
     of the same two callbacks the view already routes. */
  function picker(props: Partial<React.ComponentProps<typeof MonthGrid>> = {}) {
    const onCancelPending = vi.fn();
    const rest = grid({ pending: 'Revision recap', onCancelPending, ...props });
    return { ...rest, onCancelPending };
  }

  it('says what it is holding', () => {
    picker();
    expect(screen.getByRole('status')).toHaveTextContent('Pick a day for Revision recap');
  });

  it('shows no strip when it is holding nothing', () => {
    grid();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('can be let go of with the button', async () => {
    const user = userEvent.setup();
    const { onCancelPending } = picker();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancelPending).toHaveBeenCalledTimes(1);
  });

  it('can be let go of with Escape', async () => {
    const user = userEvent.setup();
    const { onCancelPending } = picker();
    cell('2026-8-6').focus();
    await user.keyboard('{Escape}');
    expect(onCancelPending).toHaveBeenCalledTimes(1);
  });

  /* Escape belongs to whatever is above the grid — a dialog, the page — when
     the grid is not holding anything, so it must not be swallowed here. */
  it('leaves Escape alone when it is holding nothing', async () => {
    const user = userEvent.setup();
    const onCancelPending = vi.fn();
    grid({ onCancelPending });
    cell('2026-8-6').focus();
    await user.keyboard('{Escape}');
    expect(onCancelPending).not.toHaveBeenCalled();
  });

  it('still reaches a day by arrowing to it and pressing Enter', async () => {
    const user = userEvent.setup();
    const { onSelect } = picker();
    cell('2026-8-6').focus();
    await user.keyboard('{ArrowRight}{Enter}');
    // The view decides whether that selects the day or moves the card onto it;
    // from here it is the one callback either way.
    expect(onSelect).toHaveBeenCalledWith('2026-8-7');
  });
});

describe('the focus under each date', () => {
  const focusOn = (iso: string) => (iso === '2026-08-06' ? 'Putnam practice' : '');

  it('draws the day’s main focus with an icon guessed from it', () => {
    grid({ focusOn });
    const focus = cell('2026-8-6').querySelector('.mv-cell-focus');
    expect(focus).not.toBeNull();
    expect(focus).toHaveTextContent('Putnam practice');
    // The whole of it on hover, since the line itself ellipsises.
    expect(focus).toHaveAttribute('title', 'Putnam practice');
    const icon = focus!.querySelector<HTMLElement>('.cal-ico');
    expect(icon?.style.getPropertyValue('--ico')).toMatch(/^url\(\/static\/icons\/.+\.svg\)$/);
  });

  it('sits under the date, before the day’s figures', () => {
    grid({ focusOn });
    const parts = [...cell('2026-8-6').children].map((el) => el.className);
    expect(parts.indexOf('mv-cell-focus')).toBe(parts.indexOf('mv-cell-top') + 1);
    expect(parts.indexOf('mv-cell-focus')).toBeLessThan(parts.indexOf('mv-cell-meta'));
  });

  it('draws nothing on a day without one', () => {
    grid({ focusOn });
    expect(cell('2026-8-7').querySelector('.mv-cell-focus')).toBeNull();
  });

  it('says it to a screen reader too', () => {
    grid({ focusOn });
    expect(cell('2026-8-6')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('focus Putnam practice; 2 things'),
    );
  });
});

describe('the grid it draws', () => {
  it('names each day for a screen reader, counts and all', () => {
    grid();
    const cells = within(document.body).getAllByRole('gridcell');
    const sixth = cells.find((el) => el.getAttribute('data-date') === '2026-8-6');
    expect(sixth).toHaveAttribute(
      'aria-label',
      expect.stringContaining('2 things, 120 XP'),
    );
    expect(sixth).toHaveAttribute('aria-selected', 'true');
  });
});
