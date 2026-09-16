/**
 * What the page says before it has enough to analyse.
 *
 * ## Not the same thing as `Building`
 *
 * `Building` is the right shape for one tab that needs three weeks of record:
 * the reader went to that tab wanting a specific answer, and it owes them the
 * reason it cannot give one yet. This is the whole page on somebody's second
 * day, and nobody arrived at it with a question that precise — so an
 * explanation of what is missing would be answering something they never
 * asked. What they want is what the page *does* have.
 *
 * So this states the position and then gets out of the way: one line on what
 * Summit is doing, a meter showing the account moving toward the next thing
 * that opens, and then the figures that are *already* true — which on day two
 * is most of what anybody wants anyway. The tab under it is the same tab it
 * always was, minus the panels that would be drawing a slope through two
 * points.
 *
 * ## What it does not do
 *
 * No trend, no comparison, no insight, no projection, no sample data. Every
 * figure it prints is a count of something that happened. This is the same
 * rule `Building` was written for — see the note there about what invented
 * figures cost — applied a stage earlier.
 */
import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { StatRow, type Stat } from './StatRow';
import { milestonesAhead, nextMilestone } from './milestones';
import { ACTIVE_DAY_MEANS } from '@/utils/activeDay';
import { STAGES, STAGE_BRINGS, STAGE_LABEL, type Maturity } from '@/utils/dataMaturity';

/**
 * What a day has to have on it to be counted.
 *
 * Every countdown on this page is in days *worked*, never days on the
 * calendar, and a reader watching a number go up is owed the rule behind it —
 * otherwise "4 more days" reads as a wait of four days, and somebody who
 * skips two of them thinks the page has stalled. It appears wherever a
 * countdown does, which is here, in the strip below, and in `Building`.
 *
 * The words come from utils/activeDay, beside the predicate that enforces
 * them, so the sentence on screen cannot drift from the rule behind it.
 */
export function ActiveDayNote() {
  return (
    <p className="ax-active-note">
      A day counts as soon as you {ACTIVE_DAY_MEANS} — any one of the three, however small. Days
      you do none of them are not counted against you; they are simply not counted.
    </p>
  );
}

export interface CollectingProps {
  maturity: Maturity;
  /** Already formatted, and already true. See the note above. */
  stats: Stat[];
}

/**
 * The same thing said in one line, for the stages that no longer need a block.
 *
 * From day seven the tab is the real tab — trends, comparisons, the lot — and
 * a card explaining that Summit is still learning would be sitting on top of a
 * page that plainly is not waiting for anything. What is still true is that
 * the readings are thinner than they will be, and that something specific
 * opens next. That is a line, not a card.
 *
 * It is the same component family and the same tokens as `Collecting`, so
 * crossing from one to the other reads as the same voice getting quieter
 * rather than as a different notice appearing.
 */
export function StageNote({ maturity }: { maturity: Maturity }) {
  const { activeDays, spanDays } = maturity;

  /* The next thing that actually opens, which is not always the next stage.
     At fifteen active days the next stage is `full` at thirty, but Habits
     opens at twenty-one — and "15 more days" is a discouraging and slightly
     dishonest answer to a reader who is six days from something real. */
  const next = nextMilestone(activeDays);
  if (!next) return null;
  const toNext = next.need - activeDays;

  return (
    <p className="ax-stage-note">
      <span className="ax-stage-chip">{STAGE_LABEL[maturity.stage]}</span>
      <span>
        {/* The calendar length beside the worked one, so the figure reads as
            a record being kept rather than as days gone missing. One clause
            rather than two — "14 days of your work across 43" makes a reader
            work out what the second number counts. See `spanDays` in
            utils/dataMaturity: context, never a gate. */}
        {spanDays > activeDays ? (
          <>
            Read from{' '}
            <strong>
              {activeDays} of your {spanDays} days
            </strong>{' '}
            with Summit.
          </>
        ) : (
          <>
            Read from <strong>{activeDays} days</strong> of your work.
          </>
        )}{' '}
        <strong>
          {toNext} more work {toNext === 1 ? 'day' : 'days'}
        </strong>{' '}
        <i className="ax-stage-arrow" aria-hidden="true">
          &#8594;
        </i>{' '}
        <strong>{next.title}</strong>. {next.reward}
      </span>
    </p>
  );
}

export interface LearningItem {
  label: string;
  /** Active days recorded against this one's requirement. */
  have: number;
  need: number;
  href: string;
}

/**
 * What Summit has not worked out yet, and how close it is.
 *
 * The brief for this whole feature says not to make analytics feel locked, and
 * the instinct that follows from that is to say nothing at all about the parts
 * that have not opened. That instinct is wrong: a reader who does not know
 * Habits exists cannot look forward to it, and finds it by accident three
 * weeks later. Silence is not the opposite of a paywall.
 *
 * What makes it not a paywall is that nothing is being withheld — the tab is
 * empty because the answer does not exist yet, and there is no version of this
 * product where paying, or clicking, produces it sooner. So the strip states
 * the position in the present tense and points at the thing that closes the
 * gap, which is doing the work. No padlocks, no counts of what is "left", and
 * every row links to the tab it names so a reader can go and look at what it
 * says while it is still filling.
 *
 * Rows that are already open are dropped rather than ticked. A checklist of
 * things you have finished is a different page from this one.
 */
export function LearningStrip({ items }: { items: LearningItem[] }) {
  const waiting = items.filter((item) => item.have < item.need);
  if (waiting.length === 0) return null;

  return (
    <section className="ax-learning">
      <p className="ax-learning-head">Still filling in</p>
      <ul>
        {waiting.map((item) => {
          const left = item.need - item.have;
          return (
            <li key={item.label}>
              <Link to={item.href}>
                <span className="ax-learning-name">{item.label}</span>
                <span
                  className="ax-learning-meter"
                  role="img"
                  aria-label={`${item.have} of ${item.need} days`}
                >
                  <i style={{ width: `${Math.round((item.have / item.need) * 100)}%` }} />
                </span>
                <span className="ax-learning-left">
                  {left} {left === 1 ? 'day' : 'days'}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <ActiveDayNote />
    </section>
  );
}

/**
 * The whole ladder at once: where the account stands, and what is above it.
 *
 * ## The gap this fills
 *
 * Every countdown on this page was relative — "4 more days and weekly trends
 * open here" — and a relative countdown only means something to a reader who
 * already knows the shape of the thing they are climbing. On day two nobody
 * does. They are told a number and a name, with no way to tell whether that
 * name is the last rung or the first of six, so the honest answer to "what am
 * I working toward?" was: read the next sentence in four days and find out.
 *
 * So the ladder is drawn rather than described. Five marks, filled behind you
 * and hollow ahead, and under them the thresholds that are actually still
 * coming with the reason to want each one. It says the same thing the
 * countdown says and adds the only part the countdown could not: the scale.
 *
 * ## Why reached milestones are dropped
 *
 * Same rule as `LearningStrip`, for the same reason — a list of what you have
 * already passed is a different page from a list of what is next, and mixing
 * them turns a roadmap into a scorecard. The *track* ticks, because marking
 * progress is the only job a track has; the list under it does not.
 *
 * The four thresholds are read from `STAGE_FLOOR` and `NEED_DAYS` rather than
 * written here, so a number moved in either place moves on screen without
 * anybody remembering this file exists.
 */
export function StageLadder({ maturity }: { maturity: Maturity }) {
  const { activeDays, stage } = maturity;
  const standing = STAGES.indexOf(stage);

  /* Stage floors and tab gates in one list, because a reader does not have
     two mental models of this page and should not be shown two ladders. What
     opens at 21 is a tab rather than a stage, and that distinction is ours,
     not theirs. Both the numbers and the words come from ./milestones — see
     the note there about the two of them having drifted while they lived
     apart. */
  const ahead = milestonesAhead(activeDays);

  return (
    <section className="ax-ladder">
      <p className="ax-ladder-head">Your analytics are developing</p>

      <ol
        className="ax-ladder-track"
        aria-label={`Stage ${standing + 1} of ${STAGES.length}: ${STAGE_BRINGS[stage]}`}
      >
        {STAGES.map((rung, at) => (
          <li
            key={rung}
            className={at <= standing ? 'is-reached' : undefined}
            aria-current={at === standing ? 'step' : undefined}
          >
            <span className="ax-ladder-dot" aria-hidden="true" />
            <span className="ax-ladder-name">{STAGE_BRINGS[rung]}</span>
          </li>
        ))}
      </ol>

      {ahead.length > 0 && (
        <ul className="ax-ladder-next">
          {ahead.map((step, at) => (
            <li key={step.need}>
              <p className="ax-ladder-line">
                {/* "active days" on the first row only. Repeating the unit
                    down the column turns a scannable list into four
                    sentences. */}
                <span className="ax-ladder-need">
                  {step.need}
                  {at === 0 && <em> active days</em>}
                </span>
                <span className="ax-ladder-arrow" aria-hidden="true">
                  &#8594;
                </span>
                <span className="ax-ladder-brings">{step.title}</span>
              </p>
              {/* Why that number. A threshold with no reason behind it reads
                  as a policy somebody chose; every one of these was picked for
                  an actual reason and the reader was simply never told it. */}
              <p className="ax-ladder-why">{step.why}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Collecting({ maturity, stats }: CollectingProps) {
  const { activeDays, spanDays, progress } = maturity;

  /* What opens next, and what it will do — from ./milestones rather than from
     a sentence the caller passed down, which is how the countdown here and
     the ladder below it came to promise different things at the same
     threshold. */
  const next = nextMilestone(activeDays);
  const toNext = next ? next.need - activeDays : null;

  /* Derived from the row below rather than passed in beside it — see `short`
     on Stat. Suppressed at zero, where every part of it would read "0" and a
     headline of nothing is worse than no headline. */
  const digest =
    activeDays === 0
      ? []
      : stats.map((stat) => stat.short).filter((part): part is string => Boolean(part));

  return (
    <section className="ax-collect">
      <header className="ax-collect-head">
        <p className="ax-collect-eyebrow">{STAGE_LABEL[maturity.stage]}</p>

        {/* The first thing on the page, above the explanation of itself. On
            day two these counts *are* the product: they are exact, they are
            about the reader, and they are the reason to come back tomorrow.
            An account that opens with a paragraph about what is not available
            yet has buried the only part that works. */}
        {digest.length > 0 && (
          <p className="ax-collect-digest">
            {digest.map((part, at) => (
              <Fragment key={part}>
                {at > 0 && (
                  <span className="ax-collect-sep" aria-hidden="true">
                    &middot;
                  </span>
                )}
                <span>{part}</span>
              </Fragment>
            ))}
          </p>
        )}

        <h2>
          {activeDays === 0
            ? 'Summit has nothing to go on yet.'
            : 'Summit is learning your work patterns.'}
        </h2>
        <p className="ax-collect-lead">
          {activeDays === 0 ? (
            <>
              Finish a task or run a focus session and this page starts filling in. Everything
              here is measured from what you actually do — there is no sample data to look at
              in the meantime.
            </>
          ) : (
            <>
              {activeDays === 1 ? 'One day' : `${activeDays} days`} of your work{' '}
              {activeDays === 1 ? 'is' : 'are'} on record
              {spanDays > activeDays + 1 ? `, across ${spanDays} days` : ''}. The figures below
              are counts and they are exact. Trends, patterns and ratings need more to be worth
              printing, and they arrive on their own as you go.
            </>
          )}
        </p>

        {next && toNext !== null && (
          <div className="ax-collect-next">
            <div
              className="ax-collect-meter"
              role="img"
              aria-label={`${activeDays} days recorded, ${toNext} more until ${next.title.toLowerCase()}`}
            >
              <span className="ax-collect-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>

            {/* The countdown names what it is counting to, rather than a stage
                the reader would have to already know. "2 more work days →
                Weekly trends" is a destination; "2 / 7 days" is a fraction. */}
            <p className="ax-collect-count">
              <strong>
                {toNext} more work {toNext === 1 ? 'day' : 'days'}
              </strong>
              <i className="ax-collect-arrow" aria-hidden="true">
                &#8594;
              </i>
              <strong className="ax-collect-goal">{next.title}</strong>
            </p>
            {/* And what will actually happen then, to their own record. A
                category is not a reason to come back; a sentence about what
                Summit will do with their week is. */}
            <p className="ax-collect-reward">{next.reward}</p>

            <ActiveDayNote />
          </div>
        )}

        {/* Under the countdown, because it is the countdown's missing half:
            the meter says how far to the next rung, this says how many rungs
            there are and what each is for. */}
        <StageLadder maturity={maturity} />
      </header>

      <StatRow stats={stats} />
    </section>
  );
}
