/**
 * Skill growth — what the Growth tab is about, drawn.
 *
 * The tab opened on five graded measures and all five read output: how much
 * got done, how often, how fast, how well it was rated. This is the one
 * reading on the page about *the reader* — the skill score, at the start of
 * the period and at the end of it, per subject, ranked by how far it moved.
 *
 * ## One row per subject, and the subject is the grain
 *
 * A page like this wants to print "Algebra 64 → 78, Geometry 51 → 55", and
 * Summit cannot: a task carries a subject and nothing finer. The trees that do
 * name branches are authored, and what the reader has practised in them lives
 * unscored in their own browser. So the grain is the subject, the note under
 * the panel says so in the reader's own terms rather than leaving them to
 * wonder where the branches went, and the trees stay a route map beside the
 * evidence rather than a second set of figures pretending to be it. The long
 * version is at the top of utils/skillGrowth.
 *
 * ## The band change is the headline, not the points
 *
 * "+14" is a number; "Developing → Competent" is the thing that happened. A
 * reader who crossed a band did something they could not do before, which is
 * the only sentence on this tab that answers its own name. So a promotion is
 * drawn as the row's loudest element and the points sit behind it.
 */
import { Sparkline, type Tone } from './charts';
import type { SkillTrack, TimeProgress } from '@/utils/skillGrowth';

/**
 * Which way the row reads.
 *
 * Green for a rise and amber for a fall, and amber rather than red on purpose:
 * a skill score that slipped over a term is usually a reader who stopped
 * rating rather than a reader who got worse, and this page has no way to tell
 * the two apart. Red would be a verdict it cannot support.
 */
function toneFor(track: SkillTrack): Tone {
  if (track.delta === null) return 'blue';
  if (track.delta > 0) return 'green';
  if (track.delta < 0) return 'amber';
  return 'violet';
}

function Row({ track }: { track: SkillTrack }) {
  const rose = (track.delta ?? 0) > 0;
  return (
    <li className={`sg-row${track.promoted ? ' is-promoted' : ''}`}>
      <div className="sg-row-head">
        <span className="sg-name">{track.name}</span>
        {/* The band pair, where it moved. A row that only prints the closing
            band is printing a standing, which the analytics page already
            gives — this tab owes the reader the pair. */}
        {track.promoted && track.bandThen ? (
          <span className={`sg-band is-${rose ? 'up' : 'down'}`}>
            {track.bandThen} → {track.band}
          </span>
        ) : (
          <span className="sg-band is-held">{track.band}</span>
        )}
      </div>

      <div className="sg-row-figures">
        <span className="sg-move">
          {track.then === null ? (
            /* Not a rise from zero. A subject the reader had rated nothing in
               at the start of the period did not climb from nought, it
               appeared — and "0 → 64" would be a claim about a month that
               never happened. */
            <>
              <em className="sg-new">new this period</em> <strong>{track.now}</strong>
            </>
          ) : (
            <>
              <span className="sg-then">{track.then}</span>
              <span className="sg-arrow" aria-hidden="true">→</span>
              <strong>{track.now}</strong>
            </>
          )}
        </span>

        {track.delta !== null && (
          <span className={`sg-delta is-${rose ? 'up' : track.delta < 0 ? 'down' : 'flat'}`}>
            {track.delta > 0 ? '+' : track.delta < 0 ? '−' : '±'}
            {Math.abs(track.delta)}
          </span>
        )}

        <span className="sg-spark" aria-hidden="true">
          <Sparkline values={track.spark} tone={toneFor(track)} />
        </span>
      </div>

      <p className="sg-basis">
        {track.rated} rated {track.rated === 1 ? 'task' : 'tasks'} behind this
        {track.confidence < 0.5 ? ' — still a thin reading' : ''}
      </p>
    </li>
  );
}

export interface SkillGrowthPanelProps {
  tracks: SkillTrack[];
  /** How the period reads in words, for the empty state and the note. */
  periodText: string;
  /** How many rows to draw, from the account's detail setting. */
  limit?: number;
}

export function SkillGrowthPanel({ tracks, periodText, limit = 6 }: SkillGrowthPanelProps) {
  if (!tracks.length) {
    return (
      <p className="ax-empty">
        No subject has enough rated work yet to have a level, so there is
        nothing for {periodText} to have moved. Rate a few finished tasks and
        this fills in.
      </p>
    );
  }

  const promoted = tracks.filter((track) => track.promoted && (track.delta ?? 0) > 0);

  return (
    <>
      {/* The sentence the panel is for, above the evidence for it. Assembled
          from the rows rather than written, so it cannot drift from them. */}
      {promoted.length > 0 && (
        <p className="sg-lead">
          You crossed a band in{' '}
          <strong>
            {promoted.slice(0, 2).map((track) => track.name).join(' and ')}
            {promoted.length > 2 ? ` and ${promoted.length - 2} more` : ''}
          </strong>{' '}
          over {periodText}.
        </p>
      )}

      <ul className="sg-rows">
        {tracks.slice(0, limit).map((track) => (
          <Row key={track.subject} track={track} />
        ))}
      </ul>

      <p className="ax-panel-note ax-panel-note-foot">
        One row per subject, because a finished task carries a subject and
        nothing finer. The branches inside a subject are in its skill tree,
        where they are a route map rather than a score.
      </p>
    </>
  );
}

// --------------------------------------------------------------------------
// Time → progress
// --------------------------------------------------------------------------
/**
 * What the hours bought.
 *
 * "12 hours studied" is a fact about a diary. The reader already knows how
 * much time they spent; what they cannot work out for themselves is whether
 * it moved anything, and an account can log its heaviest month and learn
 * nothing — which is exactly the month this panel exists to catch.
 *
 * Four figures, and the order is the argument: what went in, what came out of
 * it, what it changed, and whether the rate is going the right way.
 */
const round = (value: number) => Math.round(value).toLocaleString();
const one = (value: number) => (Math.round(value * 10) / 10).toLocaleString();

export interface TimeProgressPanelProps {
  progress: TimeProgress;
  periodText: string;
}

export function TimeProgressPanel({ progress, periodText }: TimeProgressPanelProps) {
  const {
    hours, hoursBefore, finished, rated, hard, pointsGained, subjectsUp,
    perHour, perHourBefore, pointsPerTenHours,
  } = progress;

  if (hours < 1 && finished === 0) {
    return (
      <p className="ax-empty">
        No focus time and no finished work in {periodText}, so there is nothing
        to weigh against anything.
      </p>
    );
  }

  const rateMove =
    perHour !== null && perHourBefore !== null && perHourBefore > 0
      ? Math.round(((perHour - perHourBefore) / perHourBefore) * 100)
      : null;

  return (
    <>
      {/* The whole panel in one line, where there is a line to state. */}
      <p className="sg-lead">
        <strong>{one(hours)}h</strong> of focus in {periodText}
        {pointsGained > 0 ? (
          <>
            {' '}→ <strong>+{pointsGained}</strong> points of level across{' '}
            {subjectsUp} {subjectsUp === 1 ? 'subject' : 'subjects'}.
          </>
        ) : (
          /* No rise is a real answer and gets stated as one. A panel that goes
             quiet when the number is zero is a panel that only reports good
             news. */
          <>, and no subject's level rose in it.</>
        )}
      </p>

      <dl className="sg-facts">
        <div className="sg-fact">
          <dt>Time in</dt>
          <dd>
            {one(hours)}h
            {hoursBefore >= 1 && (
              <span className="sg-fact-against">
                against {one(hoursBefore)}h before
              </span>
            )}
          </dd>
        </div>

        <div className="sg-fact">
          <dt>Work out</dt>
          <dd>
            {round(finished)} finished
            <span className="sg-fact-against">
              {rated} rated, {hard} of them hard
            </span>
          </dd>
        </div>

        <div className="sg-fact">
          <dt>Level gained</dt>
          <dd>
            {pointsGained > 0 ? `+${pointsGained}` : '—'}
            <span className="sg-fact-against">
              {pointsPerTenHours !== null && pointsGained > 0
                ? `${one(pointsPerTenHours)} points per 10 hours`
                : 'nothing moved yet'}
            </span>
          </dd>
        </div>

        <div className="sg-fact">
          <dt>Rate</dt>
          <dd>
            {perHour === null ? '—' : `${round(perHour)} XP/h`}
            <span className="sg-fact-against">
              {rateMove === null
                ? 'no earlier period to read against'
                : `${rateMove > 0 ? '↑' : rateMove < 0 ? '↓' : '→'} ${Math.abs(rateMove)}% on the period before`}
            </span>
          </dd>
        </div>
      </dl>

      <p className="ax-panel-note ax-panel-note-foot">
        Level is the skill score over the subjects you rated work in. Only
        rises are counted: a slip in one subject cancelling a climb in another
        would report a term of work as nothing.
      </p>
    </>
  );
}
