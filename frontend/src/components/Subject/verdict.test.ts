/**
 * components/Subject/verdict — whether the advice worked.
 *
 * The distinction every test here is really about is the one the whole loop
 * rests on: **untaken is not failed.** A recommendation nobody acted on says
 * nothing about the intervention, and a system that scores those as nil
 * results concludes that everything it suggests is useless. It is still a
 * finding, and it is a finding about the recommendation rather than about the
 * thing recommended.
 *
 * The rest is about what a verdict may claim. Two figures a fortnight apart,
 * on one account, with no control and nothing isolated — so the words are
 * `moved` and `slipped` rather than `worked` and `failed`, and three points
 * is the floor, because execution is recorded in whole stars and a star is
 * twenty-five points.
 */
import { describe, expect, it } from 'vitest';
import { DECISIVE, summarise, verdictsFrom } from './verdict';
import type { PastRecommendation } from '@/services/analytics';

function advice(over: Partial<PastRecommendation> = {}): PastRecommendation {
  return {
    id: 'r1',
    title: 'Timed set at Fair',
    focus: 'Algebra',
    type: 'timed_set',
    difficulty: 3,
    minutes: 40,
    reason: 'Execution falls 24 points at Hard.',
    signal: 'Execution at Hard rises while the level you file stays the same.',
    on: '2026-09-01',
    taken: true,
    taken_on: '2026-09-02',
    was: 64,
    task_id: '',
    ...over,
  } as PastRecommendation;
}

// ---------------------------------------------------------------------------
describe('verdictsFrom', () => {
  it('settles a taken recommendation against the figure held when it was given', () => {
    const [one] = verdictsFrom([advice()], 71);

    expect(one?.word).toBe('moved');
    expect(one?.was).toBe(64);
    expect(one?.now).toBe(71);
    expect(one?.change).toBe(7);
  });

  it('calls a fall a fall', () => {
    expect(verdictsFrom([advice()], 58)[0]?.word).toBe('slipped');
  });

  it('reads movement under a star as flat rather than as a direction', () => {
    // Execution is one to five stars, so a star is 25 points on this scale.
    // Two points is well inside the noise of a handful of tasks.
    expect(verdictsFrom([advice()], 64 + DECISIVE - 1)[0]?.word).toBe('flat');
    expect(verdictsFrom([advice()], 64 + DECISIVE)[0]?.word).toBe('moved');
  });

  it('keeps untaken separate from failed', () => {
    const [one] = verdictsFrom([advice({ taken: false, taken_on: '' })], 58);

    // Execution fell hard, and the recommendation gets no blame for it,
    // because nobody ran it.
    expect(one?.word).toBe('untaken');
    expect(one?.change).toBeNull();
  });

  it('says so when there is no before to compare against', () => {
    // Advice given before the figure was kept, or given with nothing rated.
    const [one] = verdictsFrom([advice({ was: null })], 71);

    expect(one?.word).toBe('unmeasured');
    expect(one?.change).toBeNull();
  });

  it('says so when there is no after either', () => {
    expect(verdictsFrom([advice()], null)[0]?.word).toBe('unmeasured');
  });

});

// ---------------------------------------------------------------------------
describe('summarise', () => {
  it('counts taken and settled separately, because they are different', () => {
    const summary = summarise(
      verdictsFrom(
        [advice({ id: 'a' }), advice({ id: 'b', was: null }),
         advice({ id: 'c', taken: false, taken_on: '' })],
        71,
      ),
    );

    expect(summary.given).toBe(3);
    expect(summary.taken).toBe(2);
    expect(summary.settled).toBe(1);
    expect(summary.moved).toBe(1);
  });

  it('says the loop has not started when nothing was acted on', () => {
    const summary = summarise(verdictsFrom([advice({ taken: false, taken_on: '' })], 71));
    expect(summary.say).toContain('None of it has been acted on');
  });

  it('names what is missing when things were done and nothing was rated', () => {
    const summary = summarise(verdictsFrom([advice({ was: null })], 71));
    expect(summary.say).toContain('nothing rated either side');
  });

  it('tells the reader to change shape when nothing has moved', () => {
    const summary = summarise(verdictsFrom([advice()], 64));
    expect(summary.say).toContain('different shape');
  });

  it('will not turn a handful of paired observations into a score', () => {
    // "3 of 5 worked" invites a percentage nobody should compute off five
    // paired observations on one person — and the shorter sentence this became
    // is exactly where that would have crept back in.
    const summary = summarise(verdictsFrom([advice()], 71));

    expect(summary.say).toContain('not proof');
    expect(summary.say).not.toMatch(/\d+ of \d+/);
    expect(summary.say).not.toMatch(/\d+%/);
  });

  it('says nothing at all when nothing has ever been advised', () => {
    expect(summarise([]).say).toBe('');
  });
});
