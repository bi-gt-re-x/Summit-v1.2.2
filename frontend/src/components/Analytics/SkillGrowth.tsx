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
import { useCallback, useMemo, useState } from 'react';
import { Heading, PanelGroup, Sparkline, toneVar, type Tone } from './charts';
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
import { Link } from 'react-router-dom';
import { SUBJECT_TARGETS } from '@/skills/subjectMap';
import { graphFromSubjectTree, subjectTreeById } from '@/skills/subjectTrees';
import { applyProgress, loadProgress } from '@/utils/skillProgress';
import { loadSteps as loadPlans } from '@/utils/skillSteps';
import { tallyGraph, type GraphNode } from '@/utils/skillGraph';
import type { Levels } from '@/utils/skillLevel';
import {
  subjectProgress,
  subjectVerdict,
  type Rate,
  type SubjectProgress,
} from '@/utils/subjectProgress';
import type { Goal, Task } from '@/types';

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

/**
 * What the page holds about the reader beyond the score, for the subject cards.
 *
 * Optional as a whole: without it a card falls back to the score alone, which
 * is what every caller had before the cards learned to say anything else.
 */
export interface SubjectContext {
  tasks: Task[];
  goals: Goal[];
  /** Days in the period, or null for the whole record. */
  windowDays: number | null;
  /** The period's last day, ISO. */
  toIso: string;
  periodText: string;
  /** Each step's level as the server read it from marked problems, for the
      tree tile's measured half. */
  levels: Levels;
  username: string | null;
}

/** Where the reader is on a subject's skill tree, and what they measured on it. */
interface TreeReading {
  title: string;
  done: number;
  total: number;
  /** The node this subject routes to, where it routes to one. */
  focus: GraphNode | null;
  next: GraphNode | null;
  /** Steps of the tree with problems marked against them. */
  practised: number;
  /** The best measured level among them. */
  best: number;
}

/**
 * The subject's tree, with the reader's own practice applied — the same
 * reading the skill tree page shows, so the two pages cannot disagree about
 * where somebody is on it.
 *
 * Only for a subject the catalogue routes to a tree. `treeForSubject` falls
 * back to a group's root for everything else, which is a guess that would put
 * a confident wrong tree on the card.
 */
function treeReading(subject: string, context: SubjectContext): TreeReading | null {
  const target = SUBJECT_TARGETS[subject];
  if (!target) return null;
  const tree = subjectTreeById(target.tree);
  if (!tree) return null;

  const graph = applyProgress(
    graphFromSubjectTree(tree),
    loadProgress(context.username),
    loadPlans(context.username),
  );
  const tally = tallyGraph(graph);
  const ids = new Set(graph.nodes.map((node) => node.id));
  /* Steps of this tree with anything answered on them, and the best level
     among them. Keys are `node#ordinal` — see utils/skillLevel's `skillKey`. */
  let practised = 0;
  let best = 0;
  for (const [key, step] of Object.entries(context.levels)) {
    if (step.attempted === 0 || !ids.has(key.slice(0, key.lastIndexOf('#')))) continue;
    practised += 1;
    best = Math.max(best, step.now.level);
  }

  return {
    title: tree.title,
    done: tally.complete,
    total: tally.total,
    focus: target.node ? graph.nodes.find((node) => node.id === target.node) ?? null : null,
    next:
      graph.nodes.find((node) => node.status === 'progress')
      ?? graph.nodes.find((node) => node.status === 'available')
      ?? null,
    practised,
    best,
  };
}

/** "↑ 12 pts on the period before", or the honest version of nothing. */
function changeText(rate: Rate): { text: string; tone: 'up' | 'down' | 'flat' } | null {
  if (rate.rate === null || rate.before === null) return null;
  const moved = rate.rate - rate.before;
  if (Math.abs(moved) < 3) return { text: `about the same as before (${rate.before}%)`, tone: 'flat' };
  return {
    text: `${moved > 0 ? '↑' : '↓'} from ${rate.before}% the period before`,
    tone: moved > 0 ? 'up' : 'down',
  };
}

function Tile({
  label,
  value,
  detail,
  change,
  extra,
  tone = 'plain',
}: {
  label: string;
  value: React.ReactNode;
  detail: React.ReactNode;
  change?: { text: string; tone: 'up' | 'down' | 'flat' } | null;
  extra?: React.ReactNode;
  tone?: 'plain' | 'good' | 'warn' | 'quiet';
}) {
  return (
    <div className={`sg-tile is-${tone}`}>
      <dt>{label}</dt>
      <dd>
        <span className="sg-tile-value">{value}</span>
        <span className="sg-tile-detail">{detail}</span>
        {change && <span className={`sg-tile-change is-${change.tone}`}>{change.text}</span>}
        {extra}
      </dd>
    </div>
  );
}

/** A rate as the tile's headline, or a dash over nothing. */
const shown = (rate: Rate, suffix = '') => (rate.rate === null ? '—' : `${rate.rate}%${suffix}`);

/** Green at or above `good`, amber under `warn`. */
const toneOf = (rate: Rate, good: number, warn: number) =>
  rate.rate === null ? 'quiet' : rate.rate >= good ? 'good' : rate.rate < warn ? 'warn' : 'plain';

/**
 * One subject, as how the work in it is going.
 *
 * The score that used to be the row — "49 → 57", "106 rated tasks behind this"
 * — is a figure about the record that a reader cannot act on, so it is now the
 * card's smallest line. What leads is a sentence, then six tiles a reader can
 * do something about: whether they finish what they plan, whether it goes
 * well, whether it lands on time, whether it is hard enough, where they are on
 * the subject's skill tree, and whether the goals it serves are moving.
 */
/** The band, or the band pair where it moved — the score, in words. */
function BandChip({ track }: { track: SkillTrack }) {
  const rose = (track.delta ?? 0) > 0;
  return track.promoted && track.bandThen ? (
    <span className={`sg-band is-${rose ? 'up' : 'down'}`}>
      {track.bandThen} → {track.band}
    </span>
  ) : (
    <span className="sg-band is-held">{track.band}</span>
  );
}

/**
 * Three rates small enough to sit in a closed card's head.
 *
 * A folded card that only showed a name would make the reader open every one
 * of them to find the subject worth opening. These are the three a reader
 * scans for — done, gone well, on time — plus the one alarm that cannot wait.
 */
function Glance({ read }: { read: SubjectProgress }) {
  const bits = [
    read.completion.rate !== null && `${read.completion.rate}% done`,
    read.wentWell.rate !== null && `${read.wentWell.rate}% went well`,
    read.onTime.rate !== null && `${read.onTime.rate}% on time`,
  ].filter(Boolean) as string[];
  return (
    <span className="sg-glance">
      {bits.length === 0 ? (
        <span className="sg-glance-bit is-quiet">Nothing in this period</span>
      ) : (
        bits.map((bit) => (
          <span key={bit} className="sg-glance-bit">
            {bit}
          </span>
        ))
      )}
      {read.overdue > 0 && <span className="sg-glance-bit is-alert">{read.overdue} past due</span>}
    </span>
  );
}

/** The DOM id a subject's card carries, so the highlights can jump to it. */
const cardId = (subject: string) => `sg-subject-${subject}`;

function SubjectCard({
  track,
  context,
  read,
  open,
  onToggle,
}: {
  track: SkillTrack;
  context?: SubjectContext;
  read: SubjectProgress | null;
  open: boolean;
  onToggle: () => void;
}) {
  // Only worked out once the card is opened: it reads two browser stores and
  // walks a whole tree, which twenty closed cards have no use for.
  const tree = useMemo(
    () => (context && open ? treeReading(track.subject, context) : null),
    [context, open, track.subject],
  );

  return (
    <li
      id={cardId(track.subject)}
      className={`ax-group sg-subject${open ? ' is-open' : ''}${track.promoted ? ' is-promoted' : ''}`}
    >
      {/* The same disclosure as `PanelGroup` — the heading wraps the button,
          the whole head is the target, and the chevron sits in its circle —
          so the cards fold the way every other group on this tab does. */}
      <Heading>
        <button
          type="button"
          className="ax-group-head sg-subject-head"
          aria-expanded={open}
          onClick={onToggle}
        >
          <span className="sg-subject-title">
            <strong className="sg-name">{track.name}</strong>
            <BandChip track={track} />
          </span>
          {read && <Glance read={read} />}
          <span className="ax-group-toggle" aria-hidden="true">
            <span className="ax-finding-mark" />
          </span>
        </button>
      </Heading>

      <div className="ax-group-body" inert={!open}>
        <div className="sg-subject-body">
      {read && context && <p className="sg-verdict">{subjectVerdict(read, context.periodText)}</p>}

      {read && context && (
        <dl className="sg-tiles">
          <Tile
            label="Completion"
            value={shown(read.completion)}
            tone={toneOf(read.completion, 80, 50)}
            detail={
              read.completion.den > 0
                ? `${read.completion.num} of ${read.completion.den} tasks you added were finished`
                : 'No tasks added in this period'
            }
            change={changeText(read.completion)}
          />
          <Tile
            label="Execution"
            value={shown(read.wentWell, ' went well')}
            tone={toneOf(read.wentWell, 70, 40)}
            detail={
              read.wentWell.den > 0
                ? `${read.wentWell.num} of ${read.wentWell.den} rated 4–5 for how it went`
                : 'Nothing rated in this period'
            }
            change={changeText(read.wentWell)}
          />
          <Tile
            label="On time"
            value={shown(read.onTime)}
            tone={read.overdue > 0 ? 'warn' : toneOf(read.onTime, 80, 50)}
            detail={
              read.onTime.den > 0
                ? `${read.onTime.num} of ${read.onTime.den} deadlines met`
                : 'No deadlines on finished work'
            }
            change={changeText(read.onTime)}
            extra={
              read.overdue > 0 && (
                <span className="sg-tile-alert">
                  {read.overdue} {read.overdue === 1 ? 'task' : 'tasks'} past due now
                </span>
              )
            }
          />
          <Tile
            label="Challenge"
            value={shown(read.hard, ' hard')}
            tone="plain"
            detail={
              read.hard.den > 0
                ? `${read.hard.num} of ${read.hard.den} rated 4–5 for difficulty`
                : 'Nothing rated in this period'
            }
            /* Neutral either way: more hard work is not better on its own,
               and less is not a failing — it is context for the two above. */
            change={(() => {
              const moved = changeText(read.hard);
              return moved && { ...moved, tone: 'flat' as const };
            })()}
          />
          <Tile
            label="Skill tree"
            tone={tree ? 'plain' : 'quiet'}
            value={
              tree
                ? tree.focus
                  ? `${Math.round(tree.focus.percent)}% of ${tree.focus.name}`
                  : `${tree.done} of ${tree.total} skills`
                : 'No tree'
            }
            detail={
              tree ? (
                <>
                  {tree.next ? <>Up next: <b>{tree.next.name}</b>. </> : 'Every skill on it is done. '}
                  {tree.practised > 0
                    ? `${tree.practised} ${tree.practised === 1 ? 'step' : 'steps'} practised, best Level ${tree.best} of 5.`
                    : 'No problems marked on it yet.'}
                </>
              ) : (
                'This subject has no skill tree of its own.'
              )
            }
            extra={
              tree && (
                <Link className="sg-tile-link" to={`/skill-trees?subject=${encodeURIComponent(track.subject)}`}>
                  Open {tree.title} →
                </Link>
              )
            }
          />
          <Tile
            label="Goals"
            tone={
              read.goals[0]
                ? read.goals[0].health.state === 'on-track'
                  ? 'good'
                  : read.goals[0].health.state === 'not-started'
                    ? 'plain'
                    : 'warn'
                : 'quiet'
            }
            value={read.goals[0] ? read.goals[0].health.label : 'None'}
            detail={
              read.goals[0] ? (
                <>
                  <b>{read.goals[0].goal.title}</b> — {read.goals[0].progress}% done.{' '}
                  {read.goals[0].health.reason}
                  {read.goals.length > 1 && ` +${read.goals.length - 1} more`}
                </>
              ) : (
                'No active goal uses this subject.'
              )
            }
            extra={
              !read.goals[0] && (
                <Link className="sg-tile-link" to="/goals">
                  Set one →
                </Link>
              )
            }
          />
        </dl>
      )}

      {/* The score, last and small: what the band above was read from. */}
      <div className="sg-row-foot">
        <span className="sg-spark" aria-hidden="true">
          <Sparkline values={track.spark} tone={toneFor(track)} />
        </span>
        <p className="sg-basis">
          Level score{' '}
          <span className="sg-move">
            {track.then === null ? (
              <>new this period, <strong>{track.now}</strong></>
            ) : (
              <>
                {track.then} → <strong>{track.now}</strong>
                {track.delta !== null && track.delta !== 0 && ` (${signedScore(track.delta)})`}
              </>
            )}
          </span>{' '}
          out of 100, from {track.rated} rated {track.rated === 1 ? 'task' : 'tasks'}
          {track.confidence < 0.5 ? ' — still a thin reading' : ''}
          {read?.lastDone ? ` · last finished ${shortDate(read.lastDone)}` : ''}
        </p>
      </div>
        </div>
      </div>
    </li>
  );
}

// --------------------------------------------------------------------------
// Strongest, and growing fastest
// --------------------------------------------------------------------------
/**
 * Two short lists over the cards: where the reader is strongest, and where
 * they are growing fastest.
 *
 * They answer different questions and are deliberately not one ranking. The
 * strongest subject is often the one that has stopped moving, and the one
 * climbing fastest is often still near the bottom — a single list would
 * always bury one of the two. Each entry opens and jumps to its card.
 */
function Highlights({
  tracks,
  reads,
  periodText,
  onJump,
}: {
  tracks: SkillTrack[];
  reads: Map<string, SubjectProgress>;
  periodText: string;
  onJump: (subject: string) => void;
}) {
  const strongest = [...tracks].sort((a, b) => b.now - a.now).slice(0, 3);
  const growing = tracks
    .filter((track) => (track.delta ?? 0) > 0)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
    .slice(0, 3);

  const why = (track: SkillTrack) => {
    const read = reads.get(track.subject);
    return read?.wentWell.rate != null ? `${read.wentWell.rate}% of rated work went well` : null;
  };

  return (
    <div className="sg-highlights">
      <section className="sg-highlight is-strong">
        <p className="sg-highlight-name">Strongest topics</p>
        <p className="sg-highlight-note">Your highest levels right now</p>
        <ol className="sg-highlight-list">
          {strongest.map((track, at) => (
            <li key={track.subject}>
              <button type="button" className="sg-highlight-row" onClick={() => onJump(track.subject)}>
                <span className="sg-highlight-rank">{at + 1}</span>
                <span className="sg-highlight-text">
                  <strong>{track.name}</strong>
                  <span>
                    {track.band}
                    {why(track) ? ` · ${why(track)}` : ''}
                  </span>
                </span>
                <span className="sg-highlight-go" aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="sg-highlight is-growing">
        <p className="sg-highlight-name">Fastest growing topics</p>
        <p className="sg-highlight-note">Furthest climbed over {periodText}</p>
        {growing.length === 0 ? (
          <p className="sg-highlight-empty">
            No subject’s level rose over {periodText}. Rated work that goes well, on harder
            tasks, is what lifts one.
          </p>
        ) : (
          <ol className="sg-highlight-list">
            {growing.map((track, at) => (
              <li key={track.subject}>
                <button type="button" className="sg-highlight-row" onClick={() => onJump(track.subject)}>
                  <span className="sg-highlight-rank">{at + 1}</span>
                  <span className="sg-highlight-text">
                    <strong>{track.name}</strong>
                    <span>
                      {track.promoted && track.bandThen
                        ? `${track.bandThen} → ${track.band}`
                        : `Up ${track.delta} ${track.delta === 1 ? 'point' : 'points'}, still ${track.band}`}
                    </span>
                  </span>
                  <span className="sg-highlight-go" aria-hidden="true">→</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

const signedScore = (value: number) => (value > 0 ? `+${value}` : `−${Math.abs(value)}`);

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

      {/* Every crossing, written out. The chart only has room to caption the
          ones that are not crowded (see `placeMarks` in ./GrowthLine); this is
          where the rest are read, grouped by the day they happened. */}
      {marks.length > 0 && (
        <ul className="sg-crossings" aria-label="Band changes">
          {[...new Set(marks.map((mark) => mark.at))].map((at) => (
            <li key={at}>
              <span className="sg-crossings-day">▲ {shortDate(dates[at] ?? '')}</span>
              {marks
                .filter((mark) => mark.at === at)
                .map((mark) => mark.label)
                .join(' · ')}
            </li>
          ))}
        </ul>
      )}
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
  /** Tasks, goals and tree practice, for the subject cards. See `SubjectContext`. */
  context?: SubjectContext;
}

export function SkillGrowthPanel({ tracks, periodText, limit = 6, context }: SkillGrowthPanelProps) {
  const summary = useMemo(() => skillSummary(tracks), [tracks]);

  /* Every subject's rates, once, for the cards and the highlights over them —
     two readers of one figure should never compute it twice. */
  const reads = useMemo(() => {
    const out = new Map<string, SubjectProgress>();
    if (!context) return out;
    // Every task grouped by subject in one pass, so each subject reads its own.
    const bySubject = new Map<string, Task[]>();
    for (const task of context.tasks) {
      const key = task.subject ?? '';
      const list = bySubject.get(key);
      if (list) list.push(task);
      else bySubject.set(key, [task]);
    }
    for (const track of tracks) {
      out.set(
        track.subject,
        subjectProgress({
          subject: track.subject,
          tasks: context.tasks,
          mine: bySubject.get(track.subject) ?? [],
          goals: context.goals,
          days: context.windowDays,
          toIso: context.toIso,
        }),
      );
    }
    return out;
  }, [context, tracks]);

  /* Which cards are open. Closed by default: twenty open cards is the wall
     the folding exists to prevent, and each closed head still carries its
     three rates. */
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const toggle = useCallback((subject: string) => {
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  }, []);
  /* A highlight opens its card and brings it into view. After a frame, so the
     card has started opening before it is scrolled to. */
  const jump = useCallback((subject: string) => {
    setOpen((was) => new Set(was).add(subject));
    requestAnimationFrame(() =>
      document.getElementById(cardId(subject))?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
    );
  }, []);

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
  const shownTracks = tracks.slice(0, limit);
  const allOpen = shownTracks.length > 0 && shownTracks.every((track) => open.has(track.subject));

  return (
    <>
      <Headline summary={summary} since={since} periodText={periodText} />
      <BandKey />
      <AbilityLine tracks={tracks} />

      {/* The whole section folds, and so does every card in it. Open by
          default — it is what the panel is for — but a reader who has read
          it can put twenty cards away in one press. */}
      <div className="sg-subjects">
        <PanelGroup
          title="Subject by subject"
          note={`How the work in each subject is going — ${shownTracks.length} ${shownTracks.length === 1 ? 'subject' : 'subjects'}, ${periodText}`}
          defaultOpen
        >
          {context && (
            <Highlights tracks={tracks} reads={reads} periodText={periodText} onJump={jump} />
          )}

          <div className="sg-subjects-bar">
            <span>Open a subject for its completion, execution, deadlines, skill tree and goals.</span>
            <button
              type="button"
              className="sg-subjects-all"
              onClick={() =>
                setOpen(allOpen ? new Set() : new Set(shownTracks.map((track) => track.subject)))
              }
            >
              {allOpen ? 'Close all' : 'Open all'}
            </button>
          </div>

          <ul className="sg-rows">
            {shownTracks.map((track) => (
              <SubjectCard
                key={track.subject}
                track={track}
                context={context}
                read={reads.get(track.subject) ?? null}
                open={open.has(track.subject)}
                onToggle={() => toggle(track.subject)}
              />
            ))}
          </ul>

          <p className="ax-panel-note ax-panel-note-foot">
            One card per subject, because a finished task carries a subject and
            nothing finer. The branches inside a subject are in its skill tree,
            where they are a route map rather than a score.
          </p>
        </PanelGroup>
      </div>
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
