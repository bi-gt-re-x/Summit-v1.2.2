/**
 * The four counts at the top of a subject.
 *
 * Three of them are arithmetic simple enough that the interesting cases are
 * all about absence: no window before to compare against, nothing filed to
 * be a denominator, no bottleneck the record can name. Each of those has a
 * wrong answer that looks right — "+0%", "0%", a confident focus area over a
 * record that cannot support one — and that is what is pinned here.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubjectCards } from './Cards';

const show = (over: Partial<Parameters<typeof SubjectCards>[0]> = {}) =>
  render(
    <SubjectCards
      total={50}
      finished={40}
      finishedBefore={32}
      streak={6}
      focus="Work at Hard"
      {...over}
    />,
  );

/** One card, by the label above its figure. */
const card = (label: string) =>
  within(screen.getByText(label).closest('.sb-card') as HTMLElement);

describe('what each card says', () => {
  it('counts what is filed and what is finished of it', () => {
    show();

    expect(card('Total tasks').getByText('50')).toBeInTheDocument();
    expect(card('Completed').getByText('40')).toBeInTheDocument();
    expect(card('Completed').getByText('80% of what you filed')).toBeInTheDocument();
  });

  it('carries the change against the window before', () => {
    show({ finished: 40, finishedBefore: 32 });
    expect(card('Completed').getByText('+25%')).toBeInTheDocument();
  });

  it('marks a fall as a fall rather than as a number', () => {
    show({ finished: 24, finishedBefore: 32 });

    const chip = card('Completed').getByText('-25%');
    expect(chip).toHaveClass('is-down');
  });
});

describe('what it does when there is nothing to say', () => {
  it('draws no chip when there is no window before to compare against', () => {
    /* All Time has none by definition, and a new account has nothing in the
       one there is. "+0%" is a chip that only ever means "ignore me", and a
       reader who learns to ignore one learns to ignore the rest. */
    show({ finishedBefore: 0 });

    expect(card('Completed').queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('does not divide by a pile that is not there', () => {
    show({ total: 0, finished: 0 });

    expect(card('Completed').getByText('nothing filed yet')).toBeInTheDocument();
  });

  it('says the record cannot name a focus rather than naming one anyway', () => {
    /* `bottleneckFrom` returns null when the figures do not agree on one,
       and that is a real answer. A card that hedged instead — naming
       something at 0.3 confidence — is how a reader spends a month on the
       wrong thing. */
    show({ focus: '' });

    expect(card('Focus area').getByText('Not yet')).toBeInTheDocument();
    expect(card('Focus area').getByText('the record cannot name one yet'))
      .toBeInTheDocument();
  });
});

describe('the words around the figures', () => {
  it('speaks of one day rather than 1 days', () => {
    show({ streak: 1 });
    expect(card('Current streak').getByText('day running here')).toBeInTheDocument();
  });

  it('sizes the focus card for a phrase rather than a figure', () => {
    /* Six words at the figure size is a headline that wraps to three lines
       and pushes the row's height around. */
    show();
    expect(screen.getByText('Focus area').closest('.sb-card')).toHaveClass('is-word');
  });
});
