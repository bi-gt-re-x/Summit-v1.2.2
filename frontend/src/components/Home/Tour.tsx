/**
 * The landing page's product tour: the sections that say what each part of
 * the app does, each with a small drawing of that part beside the words.
 *
 * Every claim here is checked against the app, and the comment above each
 * section says where. The numbers are the real ones (150 subjects in
 * backend/config/subjects.py, 125 trees and 2,318 skills in
 * data/skill_nodes.json, 149 badges in backend/api/achievements.py), so if one
 * of those moves, the copy here moves with it.
 *
 * The drawings are HTML and CSS, styled by styles/home-tour.css. Anything
 * that loops sits inside a `.lp-loop`, and useLoops only plays it while it is
 * on screen. With reduced motion nothing plays and each drawing shows its
 * finished state, which is how the stylesheet writes them by default.
 * `useCycle` is the same rule for the few pieces that are driven from script
 * (the timer's clock, the Spaces chat, the goal wizard's questions).
 */
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { Icon, type IconName } from '@/components/Icon';
import { MangoFigure } from '@/components/Tutorial/Mango';
import { onView, reduced } from '@/utils/homePlay';
import { SectionHead } from './sections';

/**
 * A counter that ticks while `ref` is on screen and rests at `rest` otherwise.
 * It goes 0, 1, … `steps - 1` and wraps. Off screen, and always with reduced
 * motion, it holds `rest`, which each caller sets to the frame that reads best
 * standing still.
 */
function useCycle(ref: RefObject<HTMLElement | null>, steps: number, ms: number, rest: number): number {
  const [tick, setTick] = useState(rest);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const undo = onView(el, {
      threshold: 0.3,
      play: () => {
        setTick(0);
        timer = setInterval(() => setTick((t) => (t + 1) % steps), ms);
      },
      reset: () => {
        stop();
        setTick(rest);
      },
    });
    return () => {
      undo();
      stop();
    };
  }, [ref, steps, ms, rest]);
  return tick;
}

/** A row of small cards under a section, each one fact with a label. */
export function Facts({ items }: { items: { icon: IconName; title: string; body: string }[] }) {
  return (
    <ul className="lp-facts">
      {items.map((item) => (
        <li className="lp-card lp-fact" key={item.title}>
          <span className="lp-fact-ico">
            <Icon name={item.icon} />
          </span>
          <div>
            <h4>{item.title}</h4>
            <p>{item.body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// The numbers under the hero, and the subjects scrolling past
// ---------------------------------------------------------------------------

/** Counted by useCountUps, so each `n` is written the way it should land. */
const NUMBERS = [
  { n: '150', label: 'subjects to pick from' },
  { n: '125', label: 'skill trees' },
  { n: '149', label: 'badges to earn' },
  { n: '10', label: 'timer styles' },
];

/** A slice of the catalog in backend/config/subjects.py, by its full names. */
const SUBJECTS = [
  'Algebra', 'Chemistry', 'Spanish', 'Python', 'Calculus', 'Biology', 'Essays',
  'Test Prep', 'Physics', 'Piano', 'History', 'Statistics', 'College Applications',
  'Psychology', 'Web Design', 'French', 'Geometry', 'Economics', 'Guitar',
  'Organic Chemistry', 'Model UN', 'Running', 'Flashcards', 'Machine Learning',
  'Literature', 'Driving', 'Mandarin', 'Public Speaking', 'Art', 'Chess',
];

export function Numbers() {
  return (
    <section className="lp-band" aria-label="Summit in numbers">
      <ul className="lp-numbers">
        {NUMBERS.map((item) => (
          <li className="lp-card lp-num" key={item.label}>
            <b className="lp-num-v">{item.n}</b>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
      {/* Two copies of the list, so the second slides in behind the first and
          the loop has no seam. Only the first is read out. */}
      <div className="lp-ticker">
        <p className="lp-ticker-label">Some of the subjects you can track</p>
        <div className="lp-ticker-window">
          <div className="lp-ticker-track">
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1 ? true : undefined}>
                {SUBJECTS.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works
// ---------------------------------------------------------------------------

/*
 * The four steps are the path the Mango tour walks a new account through
 * (components/Tutorial/steps.ts): add a task, put it on the calendar, start
 * the timer, finish it. The XP range is RULES.task_xp (10 to 250), and the
 * "how did it go?" question is the rate prompt a finished task opens, which
 * can be skipped (backend/tracking/analytics.py).
 */
export function HowItWorks() {
  return (
    <section className="lp-section" id="how">
      <SectionHead
        title="How it works"
        blurb="Here's what a normal school day looks like in Summit."
      />
      <ol className="lp-steps">
        <li className="lp-card lp-step">
          <span className="lp-step-n">1</span>
          <div className="lp-step-art lp-loop" aria-hidden="true">
            <div className="lp-mini-input">
              <span className="lp-type">Physics problem set</span>
            </div>
            <div className="lp-mini-slider">
              <span className="lp-mini-track"><i /></span>
              <small>80 XP · Medium</small>
            </div>
          </div>
          <h3>Add your tasks</h3>
          <p>
            Give each one a due date and a subject. Then slide its XP from 10 to 250.
            Harder work is worth more.
          </p>
        </li>
        <li className="lp-card lp-step">
          <span className="lp-step-n">2</span>
          <div className="lp-step-art lp-loop" aria-hidden="true">
            <div className="lp-mini-week">
              {['M', 'T', 'W', 'T', 'F'].map((day, i) => (
                <span key={i} className="lp-mini-day">
                  <small>{day}</small>
                  {i === 0 && <i className="lp-mini-ev" />}
                  {i === 3 && <i className="lp-mini-ev" />}
                </span>
              ))}
              <i className="lp-mini-drop" />
            </div>
          </div>
          <h3>Plan your week</h3>
          <p>
            Drag tasks onto the calendar. Switch between day, week and month to see
            what's coming.
          </p>
        </li>
        <li className="lp-card lp-step">
          <span className="lp-step-n">3</span>
          <div className="lp-step-art lp-loop" aria-hidden="true">
            <svg className="lp-mini-ring" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" className="lp-mini-ring-bed" />
              <circle cx="24" cy="24" r="20" className="lp-mini-ring-arc" pathLength={100} />
            </svg>
            <small className="lp-mini-ring-label">Focus · 25 min</small>
          </div>
          <h3>Focus on it</h3>
          <p>
            Start the timer on that task. The session gets saved with it, so you can see
            how long it really took.
          </p>
        </li>
        <li className="lp-card lp-step">
          <span className="lp-step-n">4</span>
          <div className="lp-step-art lp-loop" aria-hidden="true">
            <span className="lp-mini-check">
              <Icon name="check" />
            </span>
            <span className="lp-mini-xp">+80 XP</span>
            <span className="lp-mini-flame">
              <Icon name="flame" /> 13 days
            </span>
          </div>
          <h3>Check it off</h3>
          <p>
            You get the XP and your streak goes up. Summit asks how it went. You can
            skip that if you're busy.
          </p>
        </li>
      </ol>

      {/* Mango and the first-week quests, both for brand new accounts.
          components/Tutorial (the tour, replayed from Settings > Getting
          started) and backend/tracking/quests.py (six one-off quests, then a
          daily one until ten active days). */}
      <div className="lp-card lp-mango-card">
        <div className="lp-mango lp-loop" aria-hidden="true">
          <MangoFigure look={{ x: 0.4, y: 0.2 }} arm={-30} />
        </div>
        <div className="lp-mango-text">
          <h3>New here? Mango will show you around.</h3>
          <p>
            On your first day, a little mango with googly eyes walks you through every page.
            You can skip it, or replay it from Settings later.
          </p>
          <p>
            New accounts also get six quick quests worth XP, like finishing a first task or
            starting a first timer. After that there's one small quest a day until you've
            been active on ten days.
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Everything in Summit
// ---------------------------------------------------------------------------

const TILES: {
  icon: IconName;
  title: string;
  body: string;
  bits: string[];
  to: string;
}[] = [
  {
    icon: 'clipboard',
    title: 'Tasks',
    body: 'Every task has a due date, a subject and an XP value. Search and filter them, then finish a dozen at once.',
    bits: ['XP from 10 to 250', 'Repeats', 'Bulk finish'],
    to: '#tasks',
  },
  {
    icon: 'calendar',
    title: 'Calendar',
    body: "Day, week and month views. Drag a task to a new day and your list updates too.",
    bits: ['Drag and drop', 'Events', 'Repeats'],
    to: '#calendar',
  },
  {
    icon: 'timer',
    title: 'Focus timer',
    body: 'Ten styles, from 10 to 90 minutes. Start one on a task and the session is saved with that task.',
    bits: ['Pomodoro', 'Daily target', 'Notes'],
    to: '#timer',
  },
  {
    icon: 'target',
    title: 'Goals',
    body: "Split a big goal into checkpoints. Summit tells you if you're on track or falling behind.",
    bits: ['Checkpoints', 'On track', 'Counters'],
    to: '#goals',
  },
  {
    icon: 'flame',
    title: 'Streaks and levels',
    body: 'Finish one task a day to keep your streak. Each level takes 100 XP more than the last.',
    bits: ['Grace day', 'Vacation mode', 'No level cap'],
    to: '#streak',
  },
  {
    icon: 'chart',
    title: 'Analytics',
    body: 'A growth score built from five stats, with a grade for each. Plus a short list of what to do next.',
    bits: ['Growth score', 'Grades', 'Advice'],
    to: '#analytics',
  },
  {
    icon: 'sprout',
    title: 'Skill trees',
    body: 'A tree of skills for each subject. Each skill goes from level 0 to 5 as you practice.',
    bits: ['125 trees', '2,318 skills', 'Levels 0 to 5'],
    to: '#skills',
  },
  {
    icon: 'trophy',
    title: 'Achievements',
    body: '149 badges that pay XP when you earn them. Log your own personal bests too.',
    bits: ['Badges', 'Personal bests', 'Titles'],
    to: '#more',
  },
  {
    icon: 'pin',
    title: 'Notes',
    body: 'Write notes and link them to a task or a subject. They save while you type.',
    bits: ['Autosave', 'Linked to tasks'],
    to: '#more',
  },
  {
    icon: 'scroll',
    title: 'Log',
    body: 'A private journal. Summit picks out your goals and habits from it so its advice fits you.',
    bits: ['Private', 'Mood check-ins'],
    to: '#more',
  },
  {
    icon: 'sparkles',
    title: 'Spaces',
    body: 'Build your own pages with checklists and live charts. Or describe a page and the AI builds it.',
    bits: ['Live blocks', 'AI builder', 'Team spaces'],
    to: '#spaces',
  },
];

export function FeatureGrid() {
  return (
    <section className="lp-section" id="features">
      <SectionHead
        title="Everything in Summit"
        blurb="Each card is one part of the app. Click one to read more about it."
      />
      <div className="lp-grid">
        {TILES.map((tile) => (
          <a className="lp-card lp-tile" href={tile.to} key={tile.title}>
            <span className="lp-feat-ico lp-ico-teal">
              <Icon name={tile.icon} />
            </span>
            <h3>{tile.title}</h3>
            <p>{tile.body}</p>
            <ul className="lp-feat-bits">
              {tile.bits.map((bit) => (
                <li key={bit}>{bit}</li>
              ))}
            </ul>
            <span className="lp-tile-more">
              Read more <span className="lp-arrow">↓</span>
            </span>
          </a>
        ))}
        {/* Where the hidden chain starts on this page: secret/quote-egg.js
            counts ten clicks on the first `.lp-quote`, so this card keeps
            that class, holds no link, and everything in it is a child the
            clicks bubble up from. It used to be a made-up five-star review,
            and now it says why the app was built, which needs nobody to
            vouch for it. */}
        <article className="lp-card lp-quote">
          <p className="lp-quote-kicker">Why I made this</p>
          <p>
            Every planner I tried could show me my to-do list. None of them could tell me
            if my week actually went well.
          </p>
          <div className="lp-quote-foot">
            <span className="lp-quote-by">So I built one that could.</span>
          </div>
        </article>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Focus timer
// ---------------------------------------------------------------------------

/*
 * The ten styles and their lines are components/Timer/pomodoro.ts (`STYLES`,
 * `who`), and the daily target is its `LEVELS` (2 to 10 sessions a day).
 * "The task pays the XP" is the note above `LEVELS`: running the timer earns
 * nothing on its own. A session tied to a task, and the jot box after it,
 * are the Timer page's (components/Timer, hooks/usePomodoro).
 */
const STYLES = [
  { name: 'Gentle', min: 10, who: 'When starting is the hard part.' },
  { name: 'Short burst', min: 15, who: 'Drills, flashcards, admin.' },
  { name: 'Sprint', min: 20, who: 'Tiring work, generous breaks.' },
  { name: 'Classic', min: 25, who: 'The default. Start here.' },
  { name: 'Extended', min: 30, who: 'Room to finish a thought.' },
  { name: 'Animedoro', min: 40, who: 'Long evenings, real breaks.' },
  { name: 'Study hall', min: 45, who: 'The length of a school period.' },
  { name: 'Deep work', min: 50, who: 'Essays, proofs, code, practice.' },
  { name: 'DeskTime', min: 52, who: '52 on, 17 off. A popular split.' },
  { name: 'Ultradian', min: 90, who: 'As long as most people stay sharp.' },
];

/** The clock: 120 ticks of focus (25:00 down to 0:00), then 20 of break. */
const FOCUS_TICKS = 120;
const CLOCK_TICKS = 140;

function clock(tick: number): { label: string; time: string; left: number } {
  if (tick >= FOCUS_TICKS) return { label: 'Break', time: '5:00', left: 1 };
  const seconds = Math.round(25 * 60 * (1 - tick / FOCUS_TICKS));
  const mm = Math.floor(seconds / 60);
  const ss = String(seconds % 60).padStart(2, '0');
  return { label: 'Focus', time: `${mm}:${ss}`, left: seconds / (25 * 60) };
}

export function TimerTour() {
  const card = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  // Resting at a third of the way through, so a still page shows a clock
  // that is clearly running rather than one that hasn't started.
  const tick = useCycle(card, CLOCK_TICKS, 100, 40);
  const pick = useCycle(list, STYLES.length, 1800, 3);
  const now = clock(tick);

  return (
    <section className="lp-section" id="timer">
      <SectionHead
        title="Focus timer"
        blurb="Pick a style that fits the work and start it on a task. When the session ends, jot down what you got done."
      />
      <div className="lp-duo">
        <div className="lp-card lp-timer" ref={card} aria-hidden="true">
          <div className="lp-card-top">
            <span className="lp-pill-mini">Classic · 25 min</span>
            <span className="lp-timer-round">Session 2 of 4</span>
          </div>
          <div className="lp-timer-dial">
            <svg viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" className="lp-timer-bed" />
              <circle
                cx="60"
                cy="60"
                r="52"
                className="lp-timer-arc"
                pathLength={100}
                style={{ strokeDashoffset: 100 - now.left * 100 } as CSSProperties}
              />
            </svg>
            <div className="lp-timer-mid">
              <small>{now.label}</small>
              <strong>{now.time}</strong>
            </div>
          </div>
          <div className="lp-timer-task">
            <Icon name="clipboard" /> Working on <b>Physics problem set</b>
          </div>
          <div className="lp-timer-jot">
            <small>Jot it down</small>
            <span>Did 1 to 12. Stuck on 9, ask in class.</span>
          </div>
        </div>
        <ul className="lp-card lp-styles" ref={list} aria-label="The ten timer styles">
          {STYLES.map((style, i) => (
            <li key={style.name} className={i === pick ? 'is-on' : undefined}>
              <b>{style.min}</b>
              <span>
                <strong>{style.name}</strong>
                <small>{style.who}</small>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <Facts
        items={[
          {
            icon: 'target',
            title: 'Set a daily target',
            body: 'Pick how hard the day is. Level 1 aims for 2 sessions and Level 5 aims for 10.',
          },
          {
            icon: 'zap',
            title: 'The task pays the XP',
            body: "Running the timer doesn't earn XP on its own. Finishing the task does.",
          },
          {
            icon: 'chart',
            title: 'Sessions add up',
            body: "Your focus time feeds the Focus stat in Analytics. That's one of the five stats in your growth score.",
          },
        ]}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

/*
 * The six questions are NewGoalWizard's `STEPS`, word for word. Counter goals
 * are SystemGoalWizard (XP, streak, tasks, focus time). The chip and its line
 * are the goal's health (backend/tracking/goal_health.py), in its own words:
 * on track, behind (past the date, behind the calendar, or two weeks with no
 * work) or not started. The check at the end is the "Is this goal done?"
 * panel and GoalCelebration.
 */
const QUESTIONS = [
  'What do you want to accomplish?',
  'Why does it matter?',
  'When do you want it?',
  'How will you know?',
  'Break it into checkpoints',
  'How should it look?',
];

const CHECKPOINTS = ['Limits', 'Derivatives', 'Integrals', 'Two practice exams'];

export function GoalsTour() {
  const steps = useRef<HTMLOListElement>(null);
  const asking = useCycle(steps, QUESTIONS.length, 1600, 4);

  return (
    <section className="lp-section" id="goals">
      <SectionHead
        title="Goals"
        blurb="A new goal starts with a few short questions. Only the first one is required. Then you break it into checkpoints and Summit tells you if you're on track."
      />
      <div className="lp-duo">
        <div className="lp-card lp-goal lp-loop" aria-hidden="true">
          <div className="lp-card-top">
            <div>
              <strong className="lp-goal-title">Ace the calculus final</strong>
              <small className="lp-goal-meta">Calculus · Due Dec 12</small>
            </div>
            <span className="lp-pill-mini">62%</span>
          </div>
          <span className="lp-goal-bar">
            <i />
          </span>
          <ul className="lp-goal-checks">
            {CHECKPOINTS.map((name, i) => (
              <li key={name} style={{ '--i': i } as CSSProperties} className={i < 2 ? 'is-done' : undefined}>
                <span className="lp-goal-box">
                  <Icon name="check" />
                </span>
                {name}
              </li>
            ))}
          </ul>
          <div className="lp-goal-pace">
            <strong>
              <i className="lp-goal-dot" /> On track
            </strong>
            <span>62% done and keeping pace.</span>
          </div>
        </div>
        <ol className="lp-card lp-wizard" ref={steps}>
          <li className="lp-wizard-head">New goal</li>
          {QUESTIONS.map((question, i) => (
            <li key={question} className={i === asking ? 'is-on' : i < asking ? 'is-past' : undefined}>
              <span>{i + 1}</span>
              {question}
            </li>
          ))}
        </ol>
      </div>
      <Facts
        items={[
          {
            icon: 'checklist',
            title: 'Checkpoints and steps',
            body: 'Each checkpoint gets small steps to tick off. The AI can draft them for you.',
          },
          {
            icon: 'trend',
            title: 'On track or behind',
            body: 'Every goal shows which one it is, and why. Two weeks with no work on it counts as behind.',
          },
          {
            icon: 'zap',
            title: 'Simple counters',
            body: 'Just want a number? Set a target for XP, tasks, streak days or focus time.',
          },
          {
            icon: 'star',
            title: 'Is it done?',
            body: 'When a goal hits its target, Summit asks you to confirm. Then you get a little celebration.',
          },
        ]}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Skill trees
// ---------------------------------------------------------------------------

/*
 * The nodes are the start of the real Algebra tree (skills/trees/algebra.ts).
 * Levels and their names are utils/skillLevel.ts (0 Not started to
 * 5 Mastered, climbed through Easy, Medium and Hard problems), worked out
 * from the marked problems and logged batches in `skill_attempts`
 * (backend/tracking/skill_level.py). The free resources are
 * data/free_resources.json.
 */
const NODES = [
  { name: 'Expressions', x: 50, y: 12 },
  { name: 'Solving Equations', x: 50, y: 32 },
  { name: 'Exponent Rules', x: 20, y: 52 },
  { name: 'Multi-Step Equations', x: 80, y: 52 },
  { name: 'Polynomials', x: 20, y: 72 },
  { name: 'Factoring', x: 50, y: 90 },
];
const EDGES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [4, 5],
];
const LEVELS = ['Not started', 'Started', 'Easy', 'Medium', 'Hard', 'Mastered'];

export function SkillsTour() {
  return (
    <section className="lp-section" id="skills">
      <SectionHead
        title="Skill trees"
        blurb="Pick a subject and you get a tree of skills to work through, from the basics up. There are 125 trees with 2,318 skills between them."
      />
      <div className="lp-duo">
        <div className="lp-card lp-tree lp-loop" aria-hidden="true">
          <div className="lp-card-top">
            <span className="lp-metric-label">Algebra</span>
            <span className="lp-pill-mini">4 of 18 skills started</span>
          </div>
          <div className="lp-tree-map">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none">
              {EDGES.map(([a, b]) => (
                <line
                  key={`${a}-${b}`}
                  x1={NODES[a]!.x}
                  y1={NODES[a]!.y}
                  x2={NODES[b]!.x}
                  y2={NODES[b]!.y}
                />
              ))}
            </svg>
            {NODES.map((node, i) => (
              <span
                key={node.name}
                className="lp-tree-node"
                style={{ left: `${node.x}%`, top: `${node.y}%`, '--i': i } as CSSProperties}
              >
                {node.name}
              </span>
            ))}
          </div>
        </div>
        <div className="lp-card lp-skill lp-loop" aria-hidden="true">
          <span className="lp-metric-label">Factoring</span>
          <strong className="lp-skill-level">Level 3 · Medium</strong>
          <ol className="lp-skill-ladder">
            {LEVELS.map((name, i) => (
              <li key={name} className={i <= 3 ? 'is-lit' : undefined} style={{ '--i': i } as CSSProperties}>
                <span>{i}</span>
                {name}
              </li>
            ))}
          </ol>
          <div className="lp-skill-acc">
            <span>
              Easy <b>92%</b>
            </span>
            <span>
              Medium <b>76%</b>
            </span>
            <span>
              Hard <b>40%</b>
            </span>
          </div>
        </div>
      </div>
      <Facts
        items={[
          {
            icon: 'trend',
            title: 'Levels 0 to 5',
            body: 'Get easy problems right, then medium, then hard. Your level climbs as your score does.',
          },
          {
            icon: 'checklist',
            title: 'Log your practice',
            body: 'Mark problems right or wrong, or log a batch at once. Your level comes from those marks.',
          },
          {
            icon: 'link',
            title: 'Free resources',
            body: 'Study plans link to free courses, videos and practice sites, like Khan Academy.',
          },
        ]}
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Badges, notes and the Log
// ---------------------------------------------------------------------------

/*
 * Badges: backend/api/achievements.py, 149 in five tiers paying 25 to 500 XP
 * (TIER_XP), plus personal bests and milestones on the same page. Notes:
 * autosave and links to tasks and subjects (pages/Notes.tsx, utils/noteLinks).
 * Log: RULES.log, a private journal read into insights of four kinds, where a
 * passing feeling fades after `feeling_days` (7).
 */
const BADGES = ['First Step', 'Week Warrior', 'Early Bird', 'Record Keeper', 'Fifty Sittings', 'Deep Diver'];

export function MoreTour() {
  return (
    <section className="lp-section" id="more">
      <SectionHead
        title="Badges, notes and your Log"
        blurb="Three more things that come with your account."
      />
      <div className="lp-trio">
        <article className="lp-card lp-more">
          <div className="lp-more-art lp-badges lp-loop" aria-hidden="true">
            {BADGES.map((name, i) => (
              <span key={name} className={i < 3 ? 'is-earned' : i === 3 ? 'is-new' : undefined}>
                <Icon name={i % 3 === 0 ? 'medal' : i % 3 === 1 ? 'trophy' : 'gem'} />
              </span>
            ))}
            <em className="lp-badge-pop">+100 XP</em>
          </div>
          <h3>Achievements</h3>
          <p>
            There are 149 badges in five tiers. Each one pays 25 to 500 XP when you earn it.
          </p>
          <p>
            You can also log your own personal bests, like a mile time or a test score, and
            watch them improve.
          </p>
        </article>
        <article className="lp-card lp-more">
          <div className="lp-more-art lp-note lp-loop" aria-hidden="true">
            <strong>Momentum</strong>
            <span className="lp-note-line" style={{ '--w': '92%' } as CSSProperties} />
            <span className="lp-note-line" style={{ '--w': '78%' } as CSSProperties} />
            <span className="lp-note-line" style={{ '--w': '54%' } as CSSProperties} />
            <span className="lp-note-tag">
              <Icon name="link" /> Physics problem set
            </span>
          </div>
          <h3>Notes</h3>
          <p>
            Write notes and link them to a task or a subject. They save while you type.
          </p>
          <p>
            A task shows how many notes it has, so your work and what you wrote about it
            stay together.
          </p>
        </article>
        <article className="lp-card lp-more">
          <div className="lp-more-art lp-log lp-loop" aria-hidden="true">
            <span className="lp-note-line" style={{ '--w': '86%' } as CSSProperties} />
            <span className="lp-note-line" style={{ '--w': '64%' } as CSSProperties} />
            <span className="lp-log-chip" style={{ '--i': 0 } as CSSProperties}>
              Long-term goal · Get into nursing school
            </span>
            <span className="lp-log-chip" style={{ '--i': 1 } as CSSProperties}>
              Pattern · Works best after dinner
            </span>
          </div>
          <h3>Log</h3>
          <p>
            A private journal. Summit reads what you write and picks out your goals, habits
            and what you like.
          </p>
          <p>
            It uses that to tailor its advice. Passing feelings fade after a week.
          </p>
        </article>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

/*
 * Spaces: pages/Space.tsx and shared/rules.json `spaces`. 18 block types,
 * three personal and three team spaces, live blocks over 11 sources that
 * follow changes as they happen, and 62 panels from Analytics, the Timer and
 * the badges (e00d90b). The chat builds or edits a page from a sentence
 * (backend/tracking/space_ai.py), and the prompt below is the example in
 * that file's own notes.
 */
const PROMPT = 'A study plan for the AMC 10 with a checklist and a progress chart';
const TYPE_TICKS = PROMPT.length;
const BUILD_AT = TYPE_TICKS + 10;
const BLOCK_GAP = 6;
const SPACE_TICKS = BUILD_AT + BLOCK_GAP * 4 + 40;

export function SpacesTour() {
  const box = useRef<HTMLDivElement>(null);
  // At rest: the whole prompt typed and every block on the page.
  const tick = useCycle(box, SPACE_TICKS, 60, SPACE_TICKS - 1);
  const typed = PROMPT.slice(0, Math.min(tick, TYPE_TICKS));
  const answered = tick >= BUILD_AT;
  const shown = (n: number) => tick >= BUILD_AT + BLOCK_GAP * n;

  return (
    <section className="lp-section" id="spaces">
      <SectionHead
        title="Spaces"
        blurb="Build your own pages. Type / to add a block. Mix notes and checklists with charts that update as you work."
      />
      <div className="lp-card lp-space" ref={box} aria-hidden="true">
        <div className="lp-space-page">
          <div className="lp-space-cover" />
          <strong className="lp-space-title">AMC 10 training</strong>
          <div className={`lp-space-block${shown(0) ? ' is-in' : ''}`}>
            <small>Checklist</small>
            <span className="lp-space-todo is-done">Past paper, 2023 A</span>
            <span className="lp-space-todo is-done">Counting drills</span>
            <span className="lp-space-todo">Geometry review</span>
          </div>
          <div className={`lp-space-block lp-space-live${shown(1) ? ' is-in' : ''}`}>
            <small>
              <i className="lp-live-dot" /> Live · XP this week
            </small>
            <span className="lp-space-bars">
              {[38, 62, 45, 80, 70, 92, 58].map((h, i) => (
                <i key={i} style={{ '--h': `${h}%`, '--i': i } as CSSProperties} />
              ))}
            </span>
          </div>
          <div className={`lp-space-block lp-space-panel${shown(2) ? ' is-in' : ''}`}>
            <small>Panel · Timer</small>
            <span className="lp-space-clock">
              <svg viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" />
              </svg>
              <b>18:40</b>
            </span>
          </div>
          <div className={`lp-space-block lp-space-sticky${shown(3) ? ' is-in' : ''}`}>
            Test is Feb 5. Two papers a week until then.
          </div>
        </div>
        <div className="lp-space-chat">
          <small className="lp-space-chat-head">
            <Icon name="sparkles" /> Ask the AI
          </small>
          <p className="lp-space-me">
            {typed}
            {!answered && <i className="lp-caret" />}
          </p>
          <p className={`lp-space-ai${answered ? ' is-in' : ''}`}>
            Done. I added a checklist, a live XP chart and a timer, plus a note about your
            test date.
          </p>
        </div>
      </div>
      <Facts
        items={[
          {
            icon: 'checklist',
            title: '18 kinds of block',
            body: 'Headings, to-dos, callouts, charts, sticky notes and more.',
          },
          {
            icon: 'trend',
            title: 'Live blocks',
            body: 'Show your goals, records, calendar or stats. They update on their own when something changes.',
          },
          {
            icon: 'chart',
            title: 'Panels from your pages',
            body: 'Drop in any of 62 panels from Analytics, the Timer and your badges. Each one has settings.',
          },
          {
            icon: 'sparkles',
            title: 'Built from a sentence',
            body: 'Describe the page you want. The AI builds it or edits the one you have.',
          },
        ]}
      />
      <p className="lp-foot-note">You get three personal spaces and three team spaces you can share.</p>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/*
 * Each answer is checked: one plan (Pricing), the grace day and its refresh
 * (backend/tracking/xp.py: GRACE_EARNED_AT 7, GRACE_REFRESH_DAYS 30,
 * VACATION_MAX_DAYS 30), the late cut (RULES.overdue), custom subjects
 * (components/Analytics/Setup), the exports (Settings > Data & export) and
 * the six themes (components/Settings/ThemePicker).
 */
const FAQ = [
  {
    q: 'Is it really free?',
    a: "Yes. There's one plan and it has everything in it. You don't need a card to sign up.",
  },
  {
    q: 'Who is it for?',
    a: 'Mostly students. The subject list runs from Algebra and Chemistry to Test Prep and College Applications. You can add your own subjects too.',
  },
  {
    q: 'What happens if I miss a day?',
    a: 'Once your streak hits 7 days you earn a grace day. It covers one missed day, and a new one comes every 30 days. Miss two days in a row and the streak resets.',
  },
  {
    q: 'What if I finish a task late?',
    a: "You still get XP, just less. It drops by 25% for each day late and stops at 25% of the full amount.",
  },
  {
    q: "I'm going away. Will I lose my streak?",
    a: 'Not if you turn on vacation mode first. It pauses your streak for up to 30 days.',
  },
  {
    q: 'Does it use AI?',
    a: 'Some parts do. It can draft goal checkpoints, plan study sessions, read your Log and build Spaces pages. Tasks, the calendar, the timer and your stats all work without it.',
  },
  {
    q: 'Can I get my data out?',
    a: 'Yes. Settings has a button that downloads everything as one JSON file. You can also export one table at a time as a CSV.',
  },
  {
    q: 'Can I change how it looks?',
    a: 'Pick from six themes in Settings: Light, Dark, Midnight, Sunset, Meadow and Orchid. You can pick your own accent color too.',
  },
];

export function Faq() {
  return (
    <section className="lp-section" id="faq">
      <SectionHead title="Questions" blurb="Quick answers before you sign up." />
      <div className="lp-faq">
        {FAQ.map((item) => (
          <details className="lp-card lp-q" key={item.q}>
            <summary>
              {item.q}
              <span className="lp-q-mark" aria-hidden="true" />
            </summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
