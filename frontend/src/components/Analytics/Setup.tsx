/**
 * The questions a new account answers before this page will draw anything.
 *
 * ## Why there is a wizard here at all, when the baseline argued against one
 *
 * The screen this replaces was three questions on one card, and the comment
 * above it said, in as many words, that the moment it needed a second screen
 * it had stopped being the thing somebody does on day one and become the
 * onboarding flow they skip. That argument was right about *those three
 * questions* and it does not survive what is being asked now.
 *
 * The three were all facts the reader already knew without thinking — how many
 * days, how many hours, which subject. What has been added is not more of
 * those. It is the decisions that were previously made *for* the reader and
 * buried:
 * how they record work, how blunt the page is allowed to be about a shortfall,
 * how much of the page they want drawn, which tab it opens on, and which
 * subjects are worth a page of their own. Those are choices rather than
 * recollections, and a choice needs its options laid out and its consequence
 * stated beside it. Eight of those on one card is a wall of segmented controls
 * that nobody reads and everybody clicks past — which is the failure the old
 * comment was actually worried about, arrived at from the other direction.
 *
 * So: one question per screen, the consequence of each answer written under it
 * in the reader's own terms, and a step count that never goes above eight. The
 * two subject questions are dropped together on an account with no subjects,
 * so the flow is six there — the count comes from the steps that exist rather
 * than being declared, because a "Step 4 of 8" that skips 4 is worse than
 * either number.
 *
 * ## The two subject questions are two questions
 *
 * They sit next to each other and they read alike, so it is worth saying why
 * both are here. **Followed subjects** decide what the app *offers*: each one
 * becomes a row under Analytics in the rail with a page behind it. **The focus
 * subject** decides what a *figure means*: it is what the week's hours are
 * aimed at, and it is what lets the page tell four days of work apart from
 * four days of the work that mattered. A reader can follow four subjects with
 * no single one the week is for, and a reader with one clear focus may want no
 * extra pages at all, so neither answer is derived from the other. They also
 * land in different stores — the follow list is a preference, the focus is
 * part of the baseline.
 *
 * ## Nothing here is required to be right
 *
 * Every answer is editable afterwards — the four preferences from the settings
 * page, the three baseline figures from the panel this screen's answers feed.
 * The page says when the baseline was set so a stale one reads as stale. That
 * is what makes it reasonable to ask at all: none of this is a commitment, it
 * is the difference between the page measuring against an assumption and the
 * page measuring against something the reader said.
 *
 * ## The week is asked for; the sitting is worked out
 *
 * The middle question used to be "how long is a normal sitting?", answered
 * from four buttons. It was the one question here nobody can actually answer:
 * a sitting length is a figure you would have to average to know, and the
 * four buttons made that worse by offering a shape rather than a number — a
 * reader whose week is nine hours over three days had no button.
 *
 * So the account states the week, in a field, and `sessionFor` divides. The
 * stored baseline is unchanged — `active_days` and `session_minutes`, the same
 * two the panel and the server have always read — because the change is to
 * which of the three related figures the reader is asked for, not to what a
 * baseline is.
 *
 * ## One write, at the end
 *
 * The steps hold their answers here and nothing is sent until Finish. A wizard
 * that wrote each step as it went would leave an account that closed the tab on
 * step three with a tone but no baseline — half-configured, and no longer new
 * enough to be asked again. The whole set lands or none of it does.
 */
import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  anyHard,
  checkAmbitions,
  fieldLabel,
  type AmbitionProblem,
} from './ambitionCheck';
import type { BaselineValues } from './Baseline';
import { VIEWS } from './Header';
import type { AnalyticsHomeTab, AnalyticsDetail, AnalyticsTone, LogStyle, Prefs } from '@/services/settings';
import { latticeSubjects, treeForSubject } from '@/skills/subjectMap';
import { childrenOf, subjectTreeById } from '@/skills/subjectTrees';
import {
  DETAIL_HINT,
  DETAIL_LABEL,
  LOG_STYLE_HINT,
  LOG_STYLE_LABEL,
  SUBJECTS_MAX,
  TONE_HINT,
  TONE_LABEL,
} from '@/utils/analyticsPrefs';

/** The preferences this screen sets. The rest of analytics' are settings-only. */
export type SetupPrefs = Pick<
  Prefs,
  | 'analytics_log_style'
  | 'analytics_tone'
  | 'analytics_detail'
  | 'analytics_home_tab'
  | 'analytics_subjects'
  | 'analytics_subject_depth'
  | 'analytics_ambitions'
>;

export interface SetupAnswers {
  baseline: BaselineValues;
  prefs: SetupPrefs;
  /**
   * The checkpoints written against each followed subject, by subject id.
   *
   * Separate from `prefs` because they are not a preference and do not live in
   * that store — they are their own row (backend/api/subjects.py), and the
   * page saves them with their own call. They ride in the same answers object
   * so that the flow still has exactly one moment where everything lands.
   */
  milestones: Record<string, string[]>;
}

export interface AnalyticsSetupProps {
  /**
   * The subjects this account has actually used, for the subject questions.
   *
   * `custom` is here so this screen can drop the account's own inventions —
   * see the note on the follow question below. Callers send the catalogue as
   * it is; the filtering is this screen's job because this screen is the only
   * one whose answers need a subject to have a lattice behind it.
   */
  /** The whole catalog. Those with work (`used`) show first; search finds the rest. */
  subjects: Array<{ id: string; label: string; custom?: boolean; used?: number }>;
  /** What the account already said, when this is an edit rather than a first run. */
  current?: BaselineValues | null;
  /** The day the current baseline was set, ISO. Empty on a first run. */
  setOn?: string;
  /** Where the four preference questions start from. */
  prefs: SetupPrefs;
  /** Writes everything at once. Returns whether it landed. */
  onSave: (answers: SetupAnswers) => Promise<boolean>;
  /** Shown as a way out on the first run — the page underneath still works. */
  onSkip?: () => void;
}

/** Days a week, as the seven buttons rather than a number input. */
const DAY_CHOICES = [1, 2, 3, 4, 5, 6, 7];

/**
 * What a sitting is allowed to come to, in minutes.
 *
 * The same bounds the server holds (SESSION_MINUTES in backend/api/analytics.py),
 * repeated here because this screen derives the figure rather than asking for
 * it: a week of 40 hours over one day is a 40-hour sitting, and something has
 * to say so before the save does.
 */
const SESSION_MIN = 5;
const SESSION_MAX = 480;

/** As many hours as a week has. Beyond that the answer is not an answer. */
const WEEK_HOURS_MAX = 168;

/** Minutes as the reader would say them: 25 min, 1h, 2h 30m. */
function sittingLabel(minutes: number): string {
  const whole = Math.floor(minutes / 60);
  const rest = Math.round(minutes - whole * 60);
  if (!whole) return `${rest} min`;
  if (!rest) return whole === 1 ? '1 hour' : `${whole} hours`;
  return `${whole}h ${rest}m`;
}

/**
 * The sitting a week's hours come to, once it is spread over the days.
 *
 * Clamped rather than refused, for the same reason `_whole` clamps in
 * backend/api/settings.py: somebody who typed 90 hours a week over five days
 * meant "as much as it goes", and the alternative is a save that fails on the
 * last screen of a seven-screen flow.
 */
function sessionFor(weekHours: number, days: number): number {
  if (!(weekHours > 0) || days <= 0) return SESSION_MIN;
  const raw = Math.round((weekHours * 60) / days);
  return Math.max(SESSION_MIN, Math.min(SESSION_MAX, raw));
}

const LOG_CHOICES: LogStyle[] = ['tasks', 'sessions', 'both'];
const TONE_CHOICES: AnalyticsTone[] = ['gentle', 'balanced', 'harsh'];
const DETAIL_CHOICES: AnalyticsDetail[] = ['essentials', 'standard', 'everything'];

/**
 * A question, and what it does with the answer.
 *
 * `body` is drawn inside the card; `title` and `lead` are the heading above it.
 * The type exists so the step count, the rail and the Back/Next arithmetic all
 * read one array — a flow whose length is declared in one place and rendered
 * in another is a flow that will one day say "Step 4 of 6" on the last screen.
 */
interface Step {
  key: string;
  title: string;
  lead: string;
  body: ReactNode;
}

/** The stacked-card control most of these questions use. */
function Choices<T extends string>({
  value,
  options,
  label,
  onPick,
}: {
  value: T;
  options: Array<{ key: T; label: string; hint: string }>;
  label: string;
  onPick: (next: T) => void;
}) {
  return (
    <div className="ax-setup-choices" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`ax-setup-choice${option.key === value ? ' is-on' : ''}`}
          aria-pressed={option.key === value}
          onClick={() => onPick(option.key)}
        >
          <strong>{option.label}</strong>
          <span>{option.hint}</span>
        </button>
      ))}
    </div>
  );
}

export function AnalyticsSetup({
  subjects,
  current,
  setOn,
  prefs,
  onSave,
  onSkip,
}: AnalyticsSetupProps) {
  const [at, setAt] = useState(0);
  const [days, setDays] = useState(current?.active_days ?? 5);
  /* The week's hours, held as the string that was typed rather than as a
     number. A number would make "1." unrepresentable and so unreachable, and
     a field that deletes the decimal point out from under the cursor is a
     field nobody can type 1.5 into. Parsed where it is read. */
  const [hours, setHours] = useState(() =>
    String(
      Math.round((((current?.active_days ?? 5) * (current?.session_minutes ?? 60)) / 60) * 10) / 10,
    ),
  );
  const [focus, setFocus] = useState(current?.focus_subject ?? '');
  /* The nominated subjects, held as the ids in the order they were picked —
     that order is the reader's and the rail draws the menu in it, so a Set
     would lose the one thing about this answer that is not a membership test.
     Trimmed to what the catalogue still has, for the reason `followedSubjects`
     gives: an account re-opening these questions a year on should not be shown
     four ticked boxes when one of the subjects has since been deleted. */
  /**
   * The subjects these questions are allowed to offer.
   *
   * The account's own inventions are dropped, and that is a rule about what
   * the answers are *for* rather than tidiness. Both answers here lead
   * somewhere that needs a lattice behind the subject: the follow list gives
   * each pick a page whose whole right-hand side is its skill tree, and the
   * depth question below is a choice between that tree's branches. A subject
   * nobody authored has neither. `treeForSubject` would still route it — on
   * `group` alone, confidently and wrongly, which is how "Fantasy Football"
   * filed under Business once opened twenty nodes about unit economics.
   *
   * `latticeSubjects` is the same filter the skill tree page applies before it
   * offers anything, and it is used here rather than re-derived so the two
   * screens cannot disagree about which subjects have a tree.
   */
  const pickable = useMemo(
    () => latticeSubjects(subjects.map((s) => ({ ...s, custom: Boolean(s.custom) }))),
    [subjects],
  );

  /* What the follow list is narrowed to. Empty shows the subjects with work
     and the ones picked; typing searches every subject. */
  const [find, setFind] = useState('');
  const shownPicks = useMemo(() => {
    const wanted = find.trim().toLowerCase();
    if (wanted) return pickable.filter((subject) => subject.label.toLowerCase().includes(wanted));
    const worked = pickable.filter((subject) => subject.used);
    return worked.length ? worked : pickable.slice(0, 16);
  }, [find, pickable]);

  const [followed, setFollowed] = useState<string[]>(() => {
    const known = new Set(pickable.map((subject) => subject.id));
    return prefs.analytics_subjects.filter((id) => known.has(id)).slice(0, SUBJECTS_MAX);
  });

  /* Which branch of each followed subject the reader wants to go into, keyed
     by subject id. Held whole rather than per-subject so the step below can be
     one screen for all four picks — four screens asking the same question with
     a different heading is the wall this flow is written against. */
  const [depth, setDepth] = useState<Record<string, string>>(
    () => ({ ...prefs.analytics_subject_depth }),
  );

  /* What each followed subject is *for*, and where the reader says they are.
     Held as one map so the step below is one screen for all four picks. */
  const [ambitions, setAmbitions] = useState<Record<string, { aim: string; level: string }>>(
    () => ({ ...prefs.analytics_ambitions }),
  );

  /* The checkpoints, as the newline-separated text the field actually holds.
     Split on the way out rather than on every keystroke: a list that re-joined
     itself as you typed would eat the blank line you were about to write on. */
  const [checkpoints, setCheckpoints] = useState<Record<string, string>>({});
  const [logStyle, setLogStyle] = useState<LogStyle>(prefs.analytics_log_style);
  const [tone, setTone] = useState<AnalyticsTone>(prefs.analytics_tone);
  const [detail, setDetail] = useState<AnalyticsDetail>(prefs.analytics_detail);
  const [homeTab, setHomeTab] = useState<AnalyticsHomeTab>(prefs.analytics_home_tab);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  /* What the aims step said that cannot be used, and what to do once it is
     dismissed. Null is "no popup". See ./ambitionCheck for what counts. */
  const [problems, setProblems] = useState<AmbitionProblem[] | null>(null);
  const [pending, setPending] = useState<'next' | 'save' | null>(null);
  /* The answers a reader has already been warned about and kept anyway, as the
     text they held at the time. A flag would not do: the check runs again at
     the save, so a plain "they waived it" would carry a waiver granted over
     twelve checkpoints onto the twenty they typed afterwards. Comparing the
     text means changing anything asks again, and changing nothing does not. */
  const [waived, setWaived] = useState('');

  const editing = Boolean(current);

  /* The week's hours as a number, and the sitting they come to once spread
     over the days. The week is the answer and the sitting is derived, which is
     the way round the reader thinks: nobody knows their average sitting to the
     minute, and everybody knows roughly what a week of theirs holds.

     Printed under both questions as they are answered, because a baseline is
     easy to set carelessly and this is the line that makes an unrealistic one
     obvious while it is still being chosen rather than three weeks later. */
  const typed = Number.parseFloat(hours);
  const weeklyHours = Number.isFinite(typed)
    ? Math.max(0, Math.min(WEEK_HOURS_MAX, typed))
    : 0;
  const minutes = sessionFor(weeklyHours, days);
  /* True when the week asked for cannot be spread over the days at a sitting
     the server will accept, so the line below can say what will be stored
     instead of quietly storing something else. */
  const clamped = weeklyHours > 0 && Math.round((weeklyHours * 60) / days) !== minutes;

  /* On, off, and nothing else — the cap is enforced by the buttons being
     disabled rather than by this quietly dropping the oldest pick. A control
     that un-ticks something the reader ticked two clicks ago, without saying
     so, is a control they stop trusting. */
  const toggleFollowed = (id: string) => {
    setFollowed((was) =>
      was.includes(id)
        ? was.filter((entry) => entry !== id)
        : was.length >= SUBJECTS_MAX
          ? was
          : [...was, id],
    );
    /* Un-picking a subject takes its branch with it. A depth left behind for a
       subject that is no longer followed would be stored, invisible, and would
       come back the day the subject was picked again — an answer the reader
       gave once and has no way to see. */
    setDepth((was) => {
      if (!was[id]) return was;
      const next = { ...was };
      delete next[id];
      return next;
    });
    /* And its aim and its checkpoints. Same reason as the branch above: an
       answer stored against a subject nobody follows is one the reader has no
       way to see, and it would come back the day they picked it again. */
    setAmbitions((was) => {
      if (!was[id]) return was;
      const next = { ...was };
      delete next[id];
      return next;
    });
    setCheckpoints((was) => {
      if (!was[id]) return was;
      const next = { ...was };
      delete next[id];
      return next;
    });
  };

  const steps: Step[] = useMemo(() => {
    const list: Step[] = [
      {
        key: 'log',
        title: 'How do you track your work?',
        lead:
          'Pick the one you actually use: tasks you check off, or time you log. Your numbers start '
          + 'from it.',
        body: (
          <Choices
            label="How you record work"
            value={logStyle}
            onPick={setLogStyle}
            options={LOG_CHOICES.map((key) => ({
              key,
              label: LOG_STYLE_LABEL[key],
              hint: LOG_STYLE_HINT[key],
            }))}
          />
        ),
      },
      {
        key: 'days',
        title: 'How many days a week do you plan to work?',
        lead:
          'Think of a normal week. Four days is great if you aim for three and short if you aim for '
          + 'six.',
        body: (
          <>
            <div className="ax-setup-days" role="group" aria-label="Days a week">
              {DAY_CHOICES.map((choice) => (
                <button
                  key={choice}
                  type="button"
                  className={`ax-setup-day${choice === days ? ' is-on' : ''}`}
                  aria-pressed={choice === days}
                  onClick={() => setDays(choice)}
                >
                  {choice}
                </button>
              ))}
            </div>
            <p className="ax-setup-sum">
              <strong>{weeklyHours}h</strong> a week. That comes to about{' '}
              {sittingLabel(minutes)} a session
            </p>
          </>
        ),
      },
      {
        key: 'hours',
        title: 'How many hours a week is that?',
        lead:
          'A rough guess is fine. Summit splits it across your days to set how long a session '
          + 'should be.',
        body: (
          <>
            <div className="ax-setup-hours">
              <input
                className="ax-setup-hours-field"
                type="number"
                inputMode="decimal"
                min={0}
                max={WEEK_HOURS_MAX}
                step={0.5}
                value={hours}
                aria-label="Hours a week"
                aria-describedby="ax-setup-hours-note"
                onChange={(event) => setHours(event.target.value)}
                /* Emptied, or left as a lone minus or decimal point, on the
                   way out of the field. Nothing is stored until Finish, so
                   the repair belongs here rather than in the keystroke — see
                   `hours` above on why the typed string is what is held. */
                onBlur={() => setHours(String(weeklyHours || 0))}
              />
              <span className="ax-setup-hours-unit">hours a week</span>
            </div>
            <p className="ax-setup-sum" id="ax-setup-hours-note">
              <strong>{sittingLabel(minutes)}</strong> a session, across {days}{' '}
              {days === 1 ? 'day' : 'days'}
              {/* Said out loud rather than silently applied. A week that will
                  not fit the days at a sitting the server accepts is stored
                  at the bound, and a reader who is about to be measured
                  against that figure is owed the sentence. */}
              {clamped && (
                <em>
                  . Sessions run from {SESSION_MIN} minutes to{' '}
                  {sittingLabel(SESSION_MAX)}, so we'll use that.
                </em>
              )}
            </p>
          </>
        ),
      },
    ];

    /* Dropped rather than disabled on an account with no subjects. A question
       whose only answer is "none" is a step that costs a click and returns
       nothing, and the step count below is computed from this array so the
       rail says six rather than skipping a number. */
    if (pickable.length > 0) {
      /* Two subject questions, and they are not the same question asked twice.
         This one asks what the reader wants to *work on* — it builds the menu
         under Analytics in the rail, and each answer gets a page of its own.
         The one below asks what the baseline is *for*, so that "you worked
         four days" can be told apart from "you worked four days on the thing
         you said mattered". A reader can follow four subjects and have no
         single one the week is aimed at, which is why neither answer is
         derived from the other.

         It goes first because it is the wider question: having named the
         handful that matter, picking the one that matters most is a choice
         out of four rather than out of a hundred. */
      list.push({
        key: 'followed',
        title: 'Which subjects matter most to you?',
        lead:
          `Pick up to ${SUBJECTS_MAX}. Each one gets its own page under Analytics. Pick none and Analytics stays one page.`,
        body: (
          <>
            <input
              type="search"
              className="ax-setup-find"
              placeholder={`Search all ${pickable.length} subjects`}
              aria-label="Search subjects"
              value={find}
              onChange={(event) => setFind(event.target.value)}
            />
            <div className="ax-setup-picks" role="group" aria-label="Subjects to follow">
              {[
                ...followed
                  .map((id) => pickable.find((subject) => subject.id === id))
                  .filter((subject): subject is (typeof pickable)[number] => Boolean(subject))
                  .filter((subject) => !shownPicks.includes(subject)),
                ...shownPicks,
              ].map((subject) => {
                const on = followed.includes(subject.id);
                /* Disabled rather than hidden at the cap, and only the ones
                   that are off. A row that vanishes when a fourth is picked
                   would make the list rearrange itself under the cursor. */
                const full = !on && followed.length >= SUBJECTS_MAX;
                return (
                  <button
                    key={subject.id}
                    type="button"
                    className={`ax-setup-pick${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    disabled={full}
                    onClick={() => toggleFollowed(subject.id)}
                  >
                    {/* The position in the reader's own order, not a tick.
                        The order is stored and the rail draws the menu in it,
                        so the number is a fact about the answer rather than
                        decoration. */}
                    <span className="ax-setup-pick-slot" aria-hidden="true">
                      {on ? followed.indexOf(subject.id) + 1 : ''}
                    </span>
                    <strong>{subject.label}</strong>
                  </button>
                );
              })}
            </div>
            <p className="ax-setup-sum">
              {followed.length === 0 ? (
                <>None picked. Analytics stays one page.</>
              ) : (
                <>
                  <strong>
                    {followed.length} of {SUBJECTS_MAX}
                  </strong>{' '}
                  picked
                  {followed.length >= SUBJECTS_MAX && (
                    <em>. That's the max. Unpick one to swap it.</em>
                  )}
                </>
              )}
            </p>
          </>
        ),
      });

      /* Only when something was picked *and* at least one pick actually forks.
         A subject whose lattice has no branches has one honest answer, and a
         screen offering it alone is a click that changes nothing — the same
         reason the subject questions vanish on an account with no catalogue. */
      const forks = followed
        .map((id) => {
          const subject = pickable.find((entry) => entry.id === id);
          if (!subject) return null;
          const root = treeForSubject(id, undefined).tree;
          const branches = childrenOf(root);
          return branches.length ? { subject, root, branches } : null;
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

      if (forks.length > 0) {
        list.push({
          key: 'depth',
          title: 'Want to zoom in on any of them?',
          lead:
            "Some subjects split into branches. Pick a branch to point that subject's page and skill "
            + 'tree right at it. Not sure? Leave it on the whole subject. You can change it later.',
          body: (
            <div className="ax-setup-depths">
              {forks.map(({ subject, root, branches }) => (
                <div className="ax-setup-depth" key={subject.id}>
                  <span className="ax-setup-depth-name">{subject.label}</span>
                  <select
                    className="ax-setup-select"
                    value={depth[subject.id] ?? ''}
                    aria-label={`Which part of ${subject.label}`}
                    onChange={(event) => {
                      const next = event.target.value;
                      setDepth((was) => {
                        const out = { ...was };
                        /* Stored as absence rather than as an empty string:
                           "the whole subject" is the default every reader of
                           this map already falls back to. */
                        if (next) out[subject.id] = next;
                        else delete out[subject.id];
                        return out;
                      });
                    }}
                  >
                    <option value="">
                      All of {subjectTreeById(root)?.title ?? subject.label}
                    </option>
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.title}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          ),
        });
      }

      /* What each pick is *for*. Only when something is followed: an aim for a
         subject nobody is following has nowhere to be read. */
      if (followed.length > 0) {
        list.push({
          key: 'aims',
          title: 'What are you going for in each one?',
          lead:
            'Your big aim, in plain words. Like "make Mathcounts Nationals" or "read a paper without '
            + 'the glossary". It isn\'t a goal, so there\'s no date or checklist. It just points your '
            + 'tips at what you want. All of this is optional.',
          body: (
            <div className="ax-setup-aims">
              {followed.map((id) => {
                const subject = pickable.find((entry) => entry.id === id);
                if (!subject) return null;
                const held = ambitions[id] ?? { aim: '', level: '' };
                const write = (patch: Partial<{ aim: string; level: string }>) =>
                  setAmbitions((was) => ({ ...was, [id]: { ...held, ...patch } }));
                return (
                  <div className="ax-setup-aim" key={id}>
                    <h4>{subject.label}</h4>
                    <label>
                      <span>What are you chasing?</span>
                      <input
                        className="ax-setup-select"
                        value={held.aim}
                        maxLength={240}
                        placeholder="Where you want to get to"
                        onChange={(event) => write({ aim: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Where are you now?</span>
                      <input
                        className="ax-setup-select"
                        value={held.level}
                        maxLength={240}
                        placeholder="The level you're at today"
                        onChange={(event) => write({ level: event.target.value })}
                      />
                    </label>
                    <label>
                      <span>Checkpoints along the way, one per line</span>
                      <textarea
                        className="ax-setup-select ax-setup-lines"
                        rows={3}
                        value={checkpoints[id] ?? ''}
                        placeholder={'The stages between here and there\nOne per line'}
                        onChange={(event) =>
                          setCheckpoints((was) => ({ ...was, [id]: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                );
              })}
            </div>
          ),
        });
      }

      list.push({
        key: 'subject',
        title: 'Is most of your time for one subject?',
        lead:
          'Optional and easy to change. It lets Summit tell "you worked four days" from "you worked '
          + 'four days on what matters most".',
        body: (
          <select
            className="ax-setup-select"
            value={focus}
            onChange={(event) => setFocus(event.target.value)}
            aria-label="Main subject"
          >
            <option value="">No single subject</option>
            {pickable.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.label}
              </option>
            ))}
          </select>
        ),
      });
    }

    list.push(
      {
        key: 'tone',
        title: 'How blunt should this page be?',
        lead:
          'Your numbers stay the same. This just changes how strict the page is and how many '
          + 'problems it shows at once.',
        body: (
          <Choices
            label="How blunt the page is"
            value={tone}
            onPick={setTone}
            options={TONE_CHOICES.map((key) => ({
              key,
              label: TONE_LABEL[key],
              hint: TONE_HINT[key],
            }))}
          />
        ),
      },
      {
        key: 'detail',
        title: 'How much do you want on screen?',
        lead:
          'Nothing gets deleted. Anything you hide here is still on its own tab. This only sets '
          + 'what Overview shows first.',
        body: (
          <Choices
            label="How much detail"
            value={detail}
            onPick={setDetail}
            options={DETAIL_CHOICES.map((key) => ({
              key,
              label: DETAIL_LABEL[key],
              hint: DETAIL_HINT[key],
            }))}
          />
        ),
      },
      {
        key: 'home',
        title: 'Which tab should open first?',
        lead:
          'Pick the one you check most. Recommendations tells you what to do. Overview shows the '
          + 'big picture.',
        body: (
          <div className="ax-setup-tabs" role="group" aria-label="Which tab opens first">
            {VIEWS.map((view) => (
              <button
                key={view.key}
                type="button"
                className={`ax-setup-tab${view.key === homeTab ? ' is-on' : ''}`}
                aria-pressed={view.key === homeTab}
                onClick={() => setHomeTab(view.key)}
              >
                <strong>{view.label}</strong>
                <span>{view.purpose}</span>
              </button>
            ))}
          </div>
        ),
      },
    );

    return list;
  }, [
    ambitions, checkpoints, clamped, days, depth, detail, focus, followed, homeTab, hours,
    logStyle, minutes, pickable, tone, weeklyHours,
  ]);

  const total = steps.length;
  // Clamped rather than trusted: the subject step disappears when a catalogue
  // fails to arrive mid-flow, and an index past the end would render nothing.
  const index = Math.min(at, total - 1);
  const step = steps[index]!;
  const last = index === total - 1;

  /**
   * What the aims step holds, as the checker reads it.
   *
   * Narrowed to followed subjects for the same reason `save` narrows: an aim
   * typed against a subject that was then unfollowed is never sent, so
   * refusing to move on because of it would be refusing over nothing.
   */
  const ambitionEntries = useMemo(
    () =>
      followed.map((id) => ({
        subject: pickable.find((entry) => entry.id === id)?.label ?? id,
        aim: ambitions[id]?.aim ?? '',
        level: ambitions[id]?.level ?? '',
        checkpoints: checkpoints[id] ?? '',
      })),
    [ambitions, checkpoints, followed, pickable],
  );

  /**
   * Raise the popup if there is anything to raise it for. True means "go on".
   *
   * Run on leaving the aims step *and* again on the final save, rather than
   * only on the first. The rail above is clickable, so a reader can answer the
   * aims step, jump forward four pips and press Update without the Next button
   * ever being pressed — checking only on Next would let exactly that path
   * through, and it is not a rare path once somebody is editing rather than
   * setting up.
   */
  const signature = useMemo(() => JSON.stringify(ambitionEntries), [ambitionEntries]);

  const cleared = useCallback(
    (next: 'next' | 'save') => {
      const found = checkAmbitions(ambitionEntries);
      if (found.length === 0) return true;
      /* Already said, already answered. A hard problem is never waived — there
         is no button that grants one — so this only ever lets a truncation
         past, and only the exact truncation that was described. */
      if (!anyHard(found) && signature === waived) return true;
      setProblems(found);
      setPending(next);
      return false;
    },
    [ambitionEntries, signature, waived],
  );

  const save = async () => {
    setSaving(true);
    setFailed(false);
    const done = await onSave({
      baseline: { active_days: days, session_minutes: minutes, focus_subject: focus },
      prefs: {
        analytics_log_style: logStyle,
        analytics_tone: tone,
        analytics_detail: detail,
        analytics_home_tab: homeTab,
        analytics_subjects: followed,
        /* Narrowed to what is still followed. The toggle already prunes as it
           goes; this is the second guard, for the reader who picked a branch
           and then went back a step to change their mind about the subject. */
        analytics_subject_depth: Object.fromEntries(
          Object.entries(depth).filter(([id]) => followed.includes(id)),
        ),
        analytics_ambitions: Object.fromEntries(
          Object.entries(ambitions)
            .filter(([id, held]) => followed.includes(id) && (held.aim.trim() || held.level.trim()))
            .map(([id, held]) => [id, { aim: held.aim.trim(), level: held.level.trim() }]),
        ),
      },
      /* Split here rather than in the caller, because the field holds the text
         the reader typed and the store holds a list — and blank lines between
         checkpoints are how people space a list out while writing it. */
      milestones: Object.fromEntries(
        Object.entries(checkpoints)
          .filter(([id]) => followed.includes(id))
          .map(([id, text]): [string, string[]] => [
            id,
            text.split('\n').map((line) => line.trim()).filter(Boolean),
          ])
          .filter(([, lines]) => lines.length > 0),
      ),
    });
    setSaving(false);
    if (!done) setFailed(true);
  };

  return (
    <section className="ax-setup" aria-label="Set up your analytics">
      <div className="ax-setup-body">
        <header className="ax-setup-head">
          <p className="ax-setup-eyebrow">
            {editing ? 'Your answers' : 'Start here'} · Step {index + 1} of {total}
          </p>
          {/* Clickable, because a reader on step six who wants to change their
              answer to step two should not have to press Back four times. */}
          <ol className="ax-setup-rail" aria-label={`Step ${index + 1} of ${total}`}>
            {steps.map((entry, slot) => (
              <li key={entry.key}>
                <button
                  type="button"
                  className={`ax-setup-pip${slot === index ? ' is-on' : ''}${
                    slot < index ? ' is-done' : ''
                  }`}
                  aria-label={entry.title}
                  aria-current={slot === index ? 'step' : undefined}
                  onClick={() => setAt(slot)}
                />
              </li>
            ))}
          </ol>
          <h2>{step.title}</h2>
          <p className="ax-setup-lead">{step.lead}</p>
        </header>

        <div className="ax-setup-q">{step.body}</div>

        {failed && (
          <p className="ax-setup-failed" role="alert">
            That didn't save. Try again.
          </p>
        )}

        <footer className="ax-setup-actions">
          <button
            type="button"
            className="ax-btn"
            disabled={index === 0}
            onClick={() => setAt(index - 1)}
          >
            Back
          </button>
          {last ? (
            <button
              type="button"
              className="ax-btn ax-btn-primary"
              onClick={() => {
                if (!cleared('save')) return;
                void save();
              }}
              disabled={saving}
            >
              {saving ? 'Saving…' : editing ? 'Update' : 'Open my analytics'}
            </button>
          ) : (
            <button
              type="button"
              className="ax-btn ax-btn-primary"
              onClick={() => {
                if (step.key === 'aims' && !cleared('next')) return;
                setAt(index + 1);
              }}
            >
              Next
            </button>
          )}
          {/* On every step, not only the first. A reader who decides on step
              five that they have answered enough questions should not have to
              walk back to the start to leave — and a reader who opened these
              again to change one answer needs a way out that is not a save. */}
          {onSkip && (
            <button type="button" className="ax-setup-skip" onClick={onSkip}>
              {editing ? 'Cancel' : 'Skip the rest'}
            </button>
          )}
        </footer>

        {/* The popup. Raised over the step rather than printed under it,
            because the thing it is stopping is a button press that already
            happened: a message appearing below the fold while the wizard moves
            on is a message nobody reads, and this one is about text that is
            going to be quoted to a model or silently truncated. */}
        {problems && (
          <div
            className="ax-setup-scrim"
            role="presentation"
            onClick={() => setProblems(null)}
          >
            <div
              className="ax-setup-alert"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="ax-setup-alert-title"
              onClick={(event) => event.stopPropagation()}
            >
              <h3 id="ax-setup-alert-title">
                {anyHard(problems)
                  ? "That doesn't look like an answer"
                  : 'Some of that will get cut off'}
              </h3>
              <p className="ax-setup-alert-lead">
                {anyHard(problems)
                  ? 'Summit uses these to write your subject tips, so they need to make sense. Fix them or '
                    + 'clear them. Blank is fine.'
                  : "Nothing's wrong, but these fields have a length limit. This is what would get cut if you "
                    + 'save now.'}
              </p>
              <ul className="ax-setup-alert-list">
                {problems.map((problem, at) => (
                  <li
                    key={`${problem.subject}-${problem.field}-${at}`}
                    className={problem.hard ? 'is-hard' : undefined}
                  >
                    <strong>
                      {problem.subject} · {fieldLabel(problem.field)}
                    </strong>
                    <span>{problem.note}</span>
                  </li>
                ))}
              </ul>
              <div className="ax-setup-alert-actions">
                <button
                  type="button"
                  className="ax-btn ax-btn-primary"
                  onClick={() => {
                    setProblems(null);
                    /* Back to the step being complained about, wherever the
                       reader pressed the button from. */
                    const aims = steps.findIndex((entry) => entry.key === 'aims');
                    if (aims >= 0) setAt(aims);
                  }}
                >
                  Let me fix that
                </button>
                {/* Only when everything found is a truncation. A hard problem
                    has nothing to lose by being fixed, so there is no honest
                    button to put here for it. */}
                {!anyHard(problems) && (
                  <button
                    type="button"
                    className="ax-btn"
                    onClick={() => {
                      const go = pending;
                      setProblems(null);
                      setPending(null);
                      setWaived(signature);
                      if (go === 'save') void save();
                      else setAt(Math.min(index + 1, total - 1));
                    }}
                  >
                    {pending === 'save' ? 'Save it anyway' : 'Keep going anyway'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {editing && setOn && (
          <p className="ax-setup-set-on">
            Targets set on{' '}
            {new Date(`${setOn}T00:00:00`).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
            .
          </p>
        )}
      </div>
    </section>
  );
}
