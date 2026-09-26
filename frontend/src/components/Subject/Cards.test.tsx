/**
 * The three counts at the top of a subject.
 *
 * The arithmetic is simple enough that the interesting cases are all about
 * absence: no window before to compare against, no bottleneck the record can
 * name. Each has a wrong answer that looks right — "+0%", a confident focus
 * area over a record that cannot support one — and that is what is pinned
 * here.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubjectCards } from './Cards';

const show = (over: Partial<Parameters<typeof SubjectCards>[0]> = {}) =>
  render(
    <SubjectCards total={50} totalBefore={40} streak={6} focus="Work at Hard" {...over} />,
  );

/** One card, by the label above its figure. */
const card = (label: string) =>
  within(screen.getByText(label).closest('.sb-card') as HTMLElement);

describe('what each card says', () => {
  it('counts what is filed here in the window', () => {
    show();
    expect(card('Total tasks').getByText('50')).toBeInTheDocument();
  });

  it('does not print the figure the ring above it already prints', () => {
    /* There was a fourth card, "Completed", and it was `state.finished` —
       the same number the standing card prints under its ring, forty pixels
       up, in the same window. */
    show();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
  });

  it('carries the change against the window before', () => {
    show({ total: 50, totalBefore: 40 });
    expect(card('Total tasks').getByText('+25%')).toBeInTheDocument();
  });

  it('marks a fall as a fall rather than as a number', () => {
    show({ total: 30, totalBefore: 40 });

    const chip = card('Total tasks').getByText('-25%');
    expect(chip).toHaveClass('is-down');
  });
});

describe('what it does when there is nothing to say', () => {
  it('draws no chip when there is no window before to compare against', () => {
    /* All Time has none by definition, and a new account has nothing in the
       one there is. "+0%" is a chip that only ever means "ignore me", and a
       reader who learns to ignore one learns to ignore the rest. */
    show({ totalBefore: 0 });

    expect(card('Total tasks').queryByText(/%$/)).not.toBeInTheDocument();
    expect(card('Total tasks').getByText('filed here in this window'))
      .toBeInTheDocument();
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
