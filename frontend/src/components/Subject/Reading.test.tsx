/**
 * Key insights — the findings and the insights as one list.
 *
 * What is pinned here is the merge and the tone, because both are where a
 * wrong answer looks right: a row in the colour of a problem over a sentence
 * saying execution is climbing, or an insight losing the implication that is
 * its whole reason for existing.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Reading } from './Reading';
import type { Diagnosis, Insight } from '@/services/analytics';

const finding = (over: Partial<Diagnosis> = {}): Diagnosis => ({
  finding: 'Work stops landing at Hard',
  direction: 'hurts',
  confidence: 0.6,
  evidence: ['Hard: execution 25 over 5 rated tasks'],
  ...over,
});

const insight = (over: Partial<Insight> = {}): Insight => ({
  observation: 'Mastery is ahead of execution',
  direction: 'watch',
  evidence: 'Mastery 62; execution 61',
  implication: 'Focus on execution rather than harder material',
  ...over,
});

const rows = () => Array.from(document.querySelectorAll('.sb-key'));

describe('the two shapes become one list', () => {
  it('draws findings first and insights after, as rows of the same kind', () => {
    render(<Reading diagnosis={[finding()]} insights={[insight()]} />);

    const all = rows();
    expect(all).toHaveLength(2);
    expect(all[0]).toHaveTextContent('Work stops landing at Hard');
    expect(all[1]).toHaveTextContent('Mastery is ahead of execution');
  });

  it('puts a finding’s counted lines under it on one line', () => {
    /* Up to four short lines — "Easy: execution 47 over 141 tasks" — as a
       bulleted list under every row was three lines of chrome for one line
       of content. */
    render(
      <Reading
        diagnosis={[finding({ evidence: ['Hard: execution 25', 'Fair: execution 75'] })]}
        insights={[]}
      />,
    );

    expect(screen.getByText('Hard: execution 25 · Fair: execution 75')).toBeInTheDocument();
  });

  it('leads an insight with what to do rather than with the figures', () => {
    /* An insight's whole reason for existing is that it says what to do
       differently, and if only one line fits it is that one. */
    render(<Reading diagnosis={[]} insights={[insight()]} />);

    expect(screen.getByText('Focus on execution rather than harder material'))
      .toBeInTheDocument();
    expect(screen.queryByText('Mastery 62; execution 61')).not.toBeInTheDocument();
  });

  it('falls back to the evidence when there is no implication', () => {
    render(<Reading diagnosis={[]} insights={[insight({ implication: '' })]} />);
    expect(screen.getByText('Mastery 62; execution 61')).toBeInTheDocument();
  });

  it('draws nothing at all rather than an empty card', () => {
    const { container } = render(<Reading diagnosis={[]} insights={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('which way each row cuts', () => {
  it('says the word as well as drawing the color', () => {
    /* Colour is never the only carrier on this page. A reader scans the
       right-hand edge for "needs focus" and reads those rows. */
    render(
      <Reading
        diagnosis={[finding({ direction: 'hurts' }), finding({ direction: 'helps' })]}
        insights={[insight({ direction: 'watch' })]}
      />,
    );

    expect(screen.getByText('needs focus')).toBeInTheDocument();
    expect(screen.getByText('working')).toBeInTheDocument();
    expect(screen.getByText('worth watching')).toBeInTheDocument();
  });

  it('does not color good news as a problem', () => {
    /* The failure this field exists to prevent: "execution is improving"
       arriving in a list called diagnosis and being drawn in red. */
    render(
      <Reading
        diagnosis={[finding({ finding: 'Execution is improving', direction: 'helps' })]}
        insights={[]}
      />,
    );

    const row = rows()[0]!;
    expect(row).toHaveClass('is-helps');
    expect(within(row as HTMLElement).getByText('working')).toBeInTheDocument();
  });
});
