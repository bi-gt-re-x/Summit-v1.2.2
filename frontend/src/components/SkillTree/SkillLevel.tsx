/**
 * A skill's measured level, drawn — and the two ways a reader feeds it.
 *
 * Everything here reads utils/skillLevel, which reads the reader's own marked
 * problems. That is the whole difference from the percentage in the panel's
 * header: that one is authored and identical on every account, and this one
 * changes only when the reader gets something right or wrong. So every figure
 * on these cards is stated with what it was counted from — "91% over your
 * last 20 problems", not "91%" — because a level the reader cannot check is
 * just the authored number again with a different font.
 *
 * Four pieces:
 *
 * - `LevelCard`     one skill in full — level, last month's level, mastery,
 *                   accuracy then and now, hardest difficulty solved, last
 *                   practiced, consistency, and what the next level asks for
 * - `LevelChain`    a node's steps in order with each one's level, which is
 *                   the "Foundations → Factoring → …" view of a skill tree
 * - `ProblemMark`   Got it / Missed it under one problem
 * - `LogPractice`   "12 Medium, 9 right" for work done somewhere else
 */
import { useMemo, useState } from 'react';
import {
  EVIDENCE_TEXT,
  LEVEL_MEANS,
  LEVEL_NAME,
  MAX_LEVEL,
  TIERS,
  TIER_NAME,
  nextStepText,
  sinceText,
  stepLevels,
  type Attempt,
  type Levels,
  type StepLevels,
  type Level,
  type SkillLevel,
  type Tier,
} from '@/utils/skillLevel';


/** Five pips, filled to the level. Drawn and also said, never only drawn. */
export function LevelPips({ level }: { level: Level }) {
  return (
    <span className="slv-pips" aria-hidden="true">
      {Array.from({ length: MAX_LEVEL }, (_, i) => (
        <span key={i} className={`slv-pip${i < level ? ' is-on' : ''}`} />
      ))}
    </span>
  );
}

/** "Level 3 · Medium", as a chip. */
export function LevelChip({ read }: { read: SkillLevel }) {
  return (
    <span className={`slv-chip is-l${read.level}`} title={LEVEL_MEANS[read.level]}>
      Lv {read.level}
      <span className="slv-chip-name">{LEVEL_NAME[read.level]}</span>
    </span>
  );
}

const pct = (value: number | null) => (value === null ? '—' : `${value}%`);

// --------------------------------------------------------------------------
// One skill, in full
// --------------------------------------------------------------------------
export interface LevelCardProps {
  /** This step's readings, from the server — now and thirty days ago. */
  levels: StepLevels;
  /** Today, for tests. */
  now?: Date;
}

/** How far back "before" is. The server reads it at the same distance —
    COMPARE_DAYS in backend/tracking/skill_level.py. */
const compareDays = 30;

export function LevelCard({ levels, now }: LevelCardProps) {
  const today = useMemo(() => now ?? new Date(), [now]);
  const { before: then, now: read } = levels;
  const moved = read.level - then.level;

  return (
    <section className="slv-card" aria-label="Your level on this skill">
      <header className="slv-head">
        <div>
          <p className="slv-eyebrow">Your level</p>
          <p className="slv-level">
            Level {read.level}
            <span className="slv-of"> of {MAX_LEVEL}</span>
            <span className="slv-name"> · {LEVEL_NAME[read.level]}</span>
          </p>
          <LevelPips level={read.level} />
        </div>
        <div className="slv-was">
          {read.level === 0 && then.level === 0 ? (
            <span>Nothing marked yet</span>
          ) : moved === 0 ? (
            <span>Same as {compareDays} days ago</span>
          ) : (
            <span className={moved > 0 ? 'is-up' : 'is-down'}>
              {moved > 0 ? '↑' : '↓'} from Level {then.level} {compareDays} days ago
            </span>
          )}
        </div>
      </header>

      <p className="slv-means">{LEVEL_MEANS[read.level]}</p>

      <div className="slv-mastery">
        <p className="slv-line">
          <span>Mastery</span>
          <b>{read.mastery}%</b>
        </p>
        <span className="slv-bar" aria-hidden="true">
          <span style={{ width: `${read.mastery}%` }} />
        </span>
        <p className="slv-hint">How far along the five levels, with credit for progress toward the next.</p>
      </div>

      <dl className="slv-facts">
        <div>
          <dt>Problems attempted</dt>
          <dd>
            {read.attempted}
            <small>{read.attempted > 0 ? `${read.correct} right` : 'none yet'}</small>
          </dd>
        </div>
        <div>
          <dt>Accuracy</dt>
          <dd>
            {then.accuracy !== null && then.accuracy !== read.accuracy && (
              <span className="slv-then">{then.accuracy}% → </span>
            )}
            {pct(read.accuracy)}
            <small>over your last 20 problems</small>
          </dd>
        </div>
        <div>
          <dt>Hardest solved</dt>
          <dd>
            {then.hardest && then.hardest !== read.hardest && (
              <span className="slv-then">{TIER_NAME[then.hardest]} → </span>
            )}
            {read.hardest ? TIER_NAME[read.hardest] : '—'}
            <small>the hardest difficulty you have got right</small>
          </dd>
        </div>
        <div>
          <dt>Last practiced</dt>
          <dd>
            {sinceText(read.lastAt, today)}
            <small>{read.lastAt ? read.lastAt.slice(0, 10) : 'not yet'}</small>
          </dd>
        </div>
        <div>
          <dt>Consistency</dt>
          <dd>
            {read.activeDays} {read.activeDays === 1 ? 'day' : 'days'}
            <small>practiced in the last 4 weeks</small>
          </dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>
            {EVIDENCE_TEXT[read.evidence]}
            <small>how much this level stands on</small>
          </dd>
        </div>
      </dl>

      <TierTable read={read} />

      <p className="slv-next">
        <b>Next:</b> {nextStepText(read)}
      </p>
    </section>
  );
}

/** Each difficulty over its recent window, and whether it counts as cleared. */
function TierTable({ read }: { read: SkillLevel }) {
  return (
    <table className="slv-tiers">
      <caption>By difficulty — your last 20 at each</caption>
      <thead>
        <tr>
          <th scope="col">Difficulty</th>
          <th scope="col">Answered</th>
          <th scope="col">Right</th>
          <th scope="col">Cleared?</th>
        </tr>
      </thead>
      <tbody>
        {TIERS.map((tier) => {
          const one = read.tiers[tier];
          const done = one.cleared;
          return (
            <tr key={tier}>
              <th scope="row">{TIER_NAME[tier]}</th>
              <td>{one.attempted}</td>
              <td>{one.rate === null ? '—' : `${Math.round(one.rate * 100)}%`}</td>
              <td className={done ? 'is-yes' : ''}>{done ? '✓ Yes' : 'Not yet'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// --------------------------------------------------------------------------
// A node's steps, in order
// --------------------------------------------------------------------------
export interface ChainStep {
  ordinal: number;
  title: string;
}

/**
 * The programme as a chain of levels.
 *
 * "Recognise → Expand → Factor → …" with where the reader stands on each,
 * which is the view of a skill tree the percentage was standing in for. A row
 * opens that step's problems, because the chain is read in order to decide
 * which step to work on next.
 */
export function LevelChain({
  nodeId,
  steps,
  levels,
  onOpen,
}: {
  nodeId: string;
  steps: ChainStep[];
  /** Every step's readings, from the server. */
  levels: Levels;
  onOpen?: (ordinal: number) => void;
}) {
  const reads = useMemo(
    () => steps.map((step) => ({ step, read: stepLevels(levels, nodeId, step.ordinal).now })),
    [steps, levels, nodeId],
  );
  const started = reads.filter((entry) => entry.read.level > 0).length;

  return (
    <div className="slv-chain-wrap">
      <p className="slv-chain-sum">
        {started === 0
          ? 'No step practiced yet. Open one, try its problems, and mark each right or wrong — that is what your level is read from.'
          : `${started} of ${steps.length} steps practiced. Levels come from problems you marked right or wrong.`}
      </p>
      <ol className="slv-chain">
        {reads.map(({ step, read }) => (
          <li key={step.ordinal} className={`slv-chain-step is-l${read.level}`}>
            <button
              type="button"
              className="slv-chain-btn"
              onClick={() => onOpen?.(step.ordinal)}
              disabled={!onOpen}
            >
              <span className="slv-chain-title">{step.title}</span>
              <span className="slv-chain-meta">
                <LevelChip read={read} />
                {read.attempted > 0 && (
                  <span className="slv-chain-acc">
                    {read.accuracy}% · {read.hardest ? TIER_NAME[read.hardest] : 'none right'}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

// --------------------------------------------------------------------------
// Feeding it
// --------------------------------------------------------------------------
/**
 * Got it / Missed it, under one problem.
 *
 * Shown once the answer is, because marking is checking and there is nothing
 * to check against before then. A mark made on this visit can be changed or
 * taken back by pressing again — a click on the wrong button is the commonest
 * mistake this will see, and it should cost nothing.
 */
export function ProblemMark({
  mine,
  previous,
  busy,
  onMark,
  onUndo,
}: {
  /** The mark made on this visit, if any. */
  mine: Attempt | null;
  /** The newest mark from an earlier visit, for "last time". */
  previous: Attempt | null;
  busy: boolean;
  onMark: (correct: boolean) => void;
  onUndo: () => void;
}) {
  const pressed = mine ? (mine.correct > 0 ? 'right' : 'wrong') : null;
  const press = (right: boolean) => {
    if (busy) return;
    if (pressed === (right ? 'right' : 'wrong')) onUndo();
    else onMark(right);
  };
  return (
    <div className="slv-mark" role="group" aria-label="How did it go?">
      <span className="slv-mark-ask">How did it go?</span>
      <button
        type="button"
        className={`slv-mark-btn is-right${pressed === 'right' ? ' is-on' : ''}`}
        aria-pressed={pressed === 'right'}
        disabled={busy}
        onClick={() => press(true)}
      >
        ✓ Got it
      </button>
      <button
        type="button"
        className={`slv-mark-btn is-wrong${pressed === 'wrong' ? ' is-on' : ''}`}
        aria-pressed={pressed === 'wrong'}
        disabled={busy}
        onClick={() => press(false)}
      >
        ✗ Missed it
      </button>
      {!mine && previous && (
        <span className="slv-mark-last">
          Last time: {previous.correct > 0 ? 'right' : 'missed'}, {sinceText(previous.at)}
        </span>
      )}
    </div>
  );
}

/**
 * Work done somewhere else, logged as a count.
 *
 * A textbook exercise is evidence about Factoring as much as a problem on this
 * screen is, and a reader who did twenty of them should not have to pretend
 * otherwise. Checked here as well as on the server so a mistyped "15 right out
 * of 10" is caught before it is sent rather than after.
 */
export function LogPractice({
  busy,
  onLog,
  label = 'Did problems somewhere else? Log them here so they count.',
}: {
  busy: boolean;
  onLog: (weight: Tier, attempted: number, correct: number) => Promise<boolean>;
  label?: string;
}) {
  const [weight, setWeight] = useState<Tier>('core');
  const [attempted, setAttempted] = useState('');
  const [correct, setCorrect] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const tried = Number(attempted);
    const right = Number(correct);
    if (!Number.isInteger(tried) || tried < 1 || tried > 200) {
      setProblem('How many did you do? Between 1 and 200.');
      return;
    }
    if (!Number.isInteger(right) || right < 0 || right > tried) {
      setProblem(`How many right? Between 0 and ${tried}.`);
      return;
    }
    setProblem(null);
    const ok = await onLog(weight, tried, right);
    if (ok) {
      setDone(`Logged ${tried} ${TIER_NAME[weight]} — ${right} right.`);
      setAttempted('');
      setCorrect('');
    }
  };

  return (
    <form className="slv-log" onSubmit={submit}>
      <p className="slv-log-label">{label}</p>
      <div className="slv-log-row">
        <label>
          <span>Did</span>
          <input
            type="number"
            min={1}
            max={200}
            inputMode="numeric"
            value={attempted}
            onChange={(event) => setAttempted(event.target.value)}
            aria-label="Problems attempted"
          />
        </label>
        <label>
          <select
            value={weight}
            onChange={(event) => setWeight(event.target.value as Tier)}
            aria-label="Difficulty"
          >
            {TIERS.map((tier) => (
              <option key={tier} value={tier}>
                {TIER_NAME[tier]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>got</span>
          <input
            type="number"
            min={0}
            max={200}
            inputMode="numeric"
            value={correct}
            onChange={(event) => setCorrect(event.target.value)}
            aria-label="Problems right"
          />
          <span>right</span>
        </label>
        <button type="submit" className="slv-log-btn" disabled={busy}>
          Log
        </button>
      </div>
      {problem && <p className="slv-log-problem" role="alert">{problem}</p>}
      {done && !problem && <p className="slv-log-done" role="status">{done}</p>}
    </form>
  );
}
