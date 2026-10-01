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
import { useMemo } from 'react';
import { Sparkline, toneVar, type Tone } from './charts';
import { GrowthLine, type LineMark, type LineSeries } from './GrowthLine';
import {
  IDLE_DAYS,
  averageLine,
  bandCrossings,
  skillSummary,
  type SkillSummary,
  type SkillTrack,
  type TimeProgress,
} from '@/utils/skillGrowth';
import { SKILL_BANDS } from '@/utils/skillScore';

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

// --------------------------------------------------------------------------
// The six headline figures
// --------------------------------------------------------------------------
/** "12 Aug" — short, because it sits inside a sentence. */
function shortDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const signed = (value: number) => (value > 0 ? `+${value}` : value < 0 ? `−${Math.abs(value)}` : '±0');

/**
 * "Mathematics, Physics and 2 more" — a count's evidence, by name.
 *
 * Two names and then a number, because a figure card that lists eleven
 * subjects has stopped being a figure.
 */
function names(tracks: SkillTrack[], each: (track: SkillTrack) => string = (t) => t.name): string {
  const shown = tracks.slice(0, 2).map(each);
  const rest = tracks.length - shown.length;
  if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
  return shown.join(' and ');
}

function Stat({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: React.ReactNode;
  tone: 'violet' | 'green' | 'blue' | 'amber' | 'muted';
  children: React.ReactNode;
}) {
  return (
    <div className={`sg-stat is-${tone}`}>
      <dt>{label}</dt>
      <dd>
        <span className="sg-stat-value">{value}</span>
        <span className="sg-stat-detail">{children}</span>
      </dd>
    </div>
  );
}

/**
 * The six figures, each with the sentence that says what it is counted from.
 *
 * That second line is the point of the card, not decoration under it. "+18%"
 * on its own is a number the reader has to trust; "your average level went
 * from 52 to 61 out of 100" is one they can check against the rows below.
 */
function Headline({ summary, since, periodText }: {
  summary: SkillSummary;
  since: string;
  periodText: string;
}) {
  const { overall, improved, mastered, closest, developing, biggest, attention, total } = summary;

  return (
    <dl className="sg-stats">
      <Stat
        label="Overall growth"
        tone={overall && overall.points < 0 ? 'amber' : 'violet'}
        value={overall ? `${signed(overall.pct)}%` : 'New'}
      >
        {overall ? (
          <>
            Your average level went from <strong>{overall.avgThen}</strong> to{' '}
            <strong>{overall.avgNow}</strong> out of 100 ({signed(overall.points)} points) since{' '}
            {since}, across the {overall.subjects === 1 ? 'one subject' : `${overall.subjects} subjects`}{' '}
            you had a level in then.
          </>
        ) : (
          <>Every subject got its first level during {periodText}, so there is no starting point to measure from yet.</>
        )}
      </Stat>

      <Stat
        label="Skills improved"
        tone="green"
        value={<>{improved.length}<small> of {total}</small></>}
      >
        {improved.length ? (
          <>
            <strong>{names(improved, (t) => `${t.name} (${signed(t.delta ?? 0)})`)}</strong>{' '}
            {improved.length === 1 ? 'has' : 'have'} a higher level than on {since}.
          </>
        ) : (
          <>No subject’s level rose over {periodText}.</>
        )}
      </Stat>

      <Stat label="Skills mastered" tone="violet" value={mastered.length}>
        {mastered.length ? (
          <>
            <strong>{names(mastered)}</strong> {mastered.length === 1 ? 'is' : 'are'} at Mastery —
            a level of 90 or more out of 100.
          </>
        ) : closest ? (
          <>
            None at Mastery (90+) yet. The closest is <strong>{closest.track.name}</strong> at{' '}
            {closest.track.now} — {closest.toGo} {closest.toGo === 1 ? 'point' : 'points'} to go.
          </>
        ) : (
          <>Mastery is a level of 90 or more out of 100.</>
        )}
      </Stat>

      <Stat label="Currently developing" tone="blue" value={developing.length}>
        {developing.length ? (
          <>
            Below Mastery and practised during {periodText}:{' '}
            <strong>
              {names(developing, (t) => `${t.name} (${t.ratedInPeriod} rated ${t.ratedInPeriod === 1 ? 'task' : 'tasks'})`)}
            </strong>.
          </>
        ) : (
          <>You haven’t rated any work below Mastery during {periodText}.</>
        )}
      </Stat>

      <Stat label="Biggest growth" tone="green" value={biggest ? biggest.name : '—'}>
        {biggest ? (
          <>
            From <strong>{biggest.then}</strong> to <strong>{biggest.now}</strong> (
            {signed(biggest.delta ?? 0)} points)
            {biggest.promoted && biggest.bandThen
              ? `, moving up from ${biggest.bandThen} to ${biggest.band}.`
              : `, still ${biggest.band}.`}
          </>
        ) : (
          <>Nothing rose over {periodText}.</>
        )}
      </Stat>

      <Stat
        label="Needs attention"
        tone={attention ? 'amber' : 'muted'}
        value={attention ? attention.track.name : 'Nothing'}
      >
        {!attention ? (
          <>No subject has slipped or been left alone.</>
        ) : attention.reason === 'fell' ? (
          <>
            Slipped from <strong>{attention.track.then}</strong> to{' '}
            <strong>{attention.track.now}</strong> ({signed(attention.track.delta ?? 0)} points).{' '}
            {(attention.track.daysSince ?? 0) >= IDLE_DAYS
              ? `Nothing finished in it for ${attention.track.daysSince} days, and levels fade without practice.`
              : 'Recent work there has been rated lower, or been easier, than before.'}
          </>
        ) : attention.reason === 'idle' ? (
          <>
            Nothing finished in it for <strong>{attention.track.daysSince} days</strong>. It is at{' '}
            {attention.track.now} now, but a level fades when a subject isn’t practised.
          </>
        ) : (
          <>
            Your lowest level, at <strong>{attention.track.now}</strong> ({attention.track.band}).
            Finishing harder tasks there and rating how they went is what raises it.
          </>
        )}
      </Stat>
    </dl>
  );
}

/** What a level is, in one line, so none of the numbers above is a mystery. */
function BandKey() {
  return (
    <p className="sg-key">
      <strong>What a level is:</strong> a score out of 100 for each subject, worked out from
      how well your rated tasks went and how hard they were — not from time spent.{' '}
      {SKILL_BANDS.map((row, i) => (
        <span key={row.band} className="sg-key-band">
          {row.band} {row.from}{i === SKILL_BANDS.length - 1 ? '+' : `–${row.to - 1}`}
        </span>
      ))}
    </p>
  );
}

// --------------------------------------------------------------------------
// The line under them
// --------------------------------------------------------------------------
/** The subjects the chart draws, in the order they are ranked above. */
const LINE_TONES: Tone[] = ['blue', 'green', 'amber', 'pink'];

/**
 * Demonstrated ability over the period, not hours.
 *
 * Every point is the level a subject *had* on that date — the same score,
 * worked out over only the tasks finished by then — so the line climbs when
 * rated work went well and does not move for time logged on its own. The
 * dashed line is the average across subjects; the four that moved furthest
 * are drawn beside it.
 */
function AbilityLine({ tracks }: { tracks: SkillTrack[] }) {
  const dates = tracks[0]?.dates ?? [];
  const drawn = useMemo(() => tracks.slice(0, LINE_TONES.length), [tracks]);

  const series: LineSeries[] = useMemo(
    () => [
      {
        key: 'overall',
        label: 'Average level',
        tone: 'violet',
        color: 'var(--ax-gp-overall)',
        values: averageLine(tracks),
      },
      ...drawn.map((track, i) => ({
        key: track.subject,
        label: track.name,
        tone: LINE_TONES[i]!,
        values: track.spark,
      })),
    ],
    [tracks, drawn],
  );

  const marks: LineMark[] = useMemo(
    () => bandCrossings(drawn).map((cross) => ({ ...cross, glyph: '▲' })),
    [drawn],
  );

  if (dates.length < 2) return null;

  return (
    <div className="sg-chart">
      <h3 className="sg-chart-title">Growth over time</h3>
      <p className="sg-chart-note">
        Your level in each subject on each date, measured from rated work — not hours studied.
        It rises when hard work goes well, and slips when a subject is left alone.
        {marks.length > 0 && ' ▲ marks the day a subject moved up a band.'}
      </p>
      <ul className="sg-legend">
        {series.map((line) => (
          <li key={line.key}>
            <span
              className={`sg-swatch${line.key === 'overall' ? ' is-overall' : ''}`}
              style={{ background: line.color ?? toneVar(line.tone) }}
              aria-hidden="true"
            />
            {line.label}
            <strong>{line.values[line.values.length - 1]}</strong>
          </li>
        ))}
      </ul>
      <GrowthLine series={series} dates={dates} labels={dates.map(shortDate)} marks={marks} height={220} />
    </div>
  );
}

// --------------------------------------------------------------------------
// The panel
// --------------------------------------------------------------------------
export interface SkillGrowthPanelProps {
  tracks: SkillTrack[];
  /** How the period reads in words, for the empty state and the note. */
  periodText: string;
  /** How many rows to draw, from the account's detail setting. */
  limit?: number;
}

export function SkillGrowthPanel({ tracks, periodText, limit = 6 }: SkillGrowthPanelProps) {
  const summary = useMemo(() => skillSummary(tracks), [tracks]);

  if (!tracks.length) {
    return (
      <p className="ax-empty">
        No subject has enough rated work yet to have a level, so there is
        nothing for {periodText} to have moved. Rate a few finished tasks and
        this fills in.
      </p>
    );
  }

  const since = tracks[0]?.dates[0] ? shortDate(tracks[0].dates[0]) : 'the start';

  return (
    <>
      <Headline summary={summary} since={since} periodText={periodText} />
      <BandKey />
      <AbilityLine tracks={tracks} />

      <h3 className="sg-chart-title">Subject by subject</h3>
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
