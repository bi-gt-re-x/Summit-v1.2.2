/**
 * What a focus card claims about the account.
 *
 * The card holds two kinds of thing and the whole architecture of this page
 * depends on not confusing them: the subject and its lattice are authored and
 * identical for everybody, and the standing is this account's. So the test
 * that matters is that a card with no standing makes no claim at all — an
 * account whose figures have not been worked out yet must not be shown a
 * cheerful `0%`, which is a statement about them rather than an absence of
 * one.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FocusTopics, type FocusStanding } from './FocusTopics';
import type { Subject } from '@/services/subjects';

function subject(id: string, name: string): Subject {
  return {
    id,
    name,
    abbr: null,
    label: name,
    icon: 'book.svg',
    group: 'Study',
    used: 0,
    family: null,
    custom: false,
  };
}

const SUBJECTS = [subject('mathematics', 'Mathematics'), subject('physics', 'Physics')];

const STANDING: FocusStanding = {
  mastered: 12,
  total: 43,
  percent: 68,
  open: 3,
  next: 'Quadratic Equations',
};

function draw(standing?: ReadonlyMap<string, FocusStanding>) {
  render(
    <FocusTopics
      subjects={SUBJECTS}
      focus={['mathematics', 'physics']}
      openTrail={[]}
      standing={standing}
      onOpen={vi.fn()}
      onChange={vi.fn()}
    />,
  );
}

describe('the focus cards', () => {
  it('prints where the account stands', () => {
    draw(new Map([['mathematics', STANDING]]));

    expect(screen.getByText('68%')).toBeInTheDocument();
    expect(screen.getByText('12/43')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Quadratic Equations')).toBeInTheDocument();
  });

  it('makes no claim about a subject it has no figures for', () => {
    // `physics` is in the band and not in the map.
    draw(new Map([['mathematics', STANDING]]));
    expect(screen.getAllByText(/%$/)).toHaveLength(1);
  });

  it('draws the card it always drew when nothing is handed in', () => {
    draw();
    /* Twice on purpose: the subject is called Mathematics and so is the
       lattice it opens, and the card says both — which is the pair the
       standing is layered on top of. */
    expect(screen.getAllByText('Mathematics')).toHaveLength(2);
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it('leaves out "open now" where nothing is open', () => {
    // A row reading "0 open now" on a finished tree is a figure that answers
    // nothing; the mastered count already says it.
    draw(new Map([['mathematics', { ...STANDING, open: 0, next: null }]]));
    expect(screen.queryByText(/open now/)).toBeNull();
    expect(screen.getByText('12/43')).toBeInTheDocument();
  });
});
