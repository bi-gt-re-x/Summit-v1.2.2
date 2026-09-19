/**
 * The right-hand column: a timer, what is next, what is running, and a box.
 *
 * All four are about *now* rather than about the list — which is why they sit
 * beside it rather than in it, and why none of them takes the page's filters.
 * Searching for "physics" should not empty the panel telling you what is due at
 * four o'clock.
 */
import { useEffect, useRef, useState } from 'react';
import { useFocusSession } from '@/hooks';
import type { Task } from '@/types';
import type { Streak } from './board';
import { timeLabel } from './board';
import { Icon } from '@/components/Icon';

// --------------------------------------------------------------------------
// Focus timer
// --------------------------------------------------------------------------
/**
 * A stopwatch on the focus time the account actually records.
 *
 * **It counts up, and it is not its own clock.** The figure is
 * `useFocusSession`'s — the same day total the dashboard and the calendar read,
 * the same localStorage day, the same minutes that reach the growth chart and
 * the report card's focus metric. Starting here starts *that* session; there is
 * no second timer to disagree with it and nothing to reconcile.
 *
 * It was a twenty-five minute countdown, and a countdown is the wrong
 * instrument for this panel. A pomodoro measures a promise — how long you said
 * you would sit — and the account has no use for that number. What everything
 * downstream wants is how long you actually sat, which is the thing a stopwatch
 * reads and a countdown throws away the moment somebody works past the bell.
 *
 * The elapsed figure is derived from the session's own timestamps rather than
 * counted in ticks, so a backgrounded tab, a shut laptop or a closed browser
 * lose nothing: the display catches up the instant anyone looks at it. The
 * interval below re-renders, it does not measure.
 */
function FocusTimer({ username }: { username: string | null }) {
  const session = useFocusSession(username);
  const [, tick] = useState(0);

  // Only while running, and only once a second. Nothing here counts — see above.
  useEffect(() => {
    if (!session.running) return;
    const id = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [session.running]);

  const seconds = Math.max(0, Math.floor(session.focused));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  // The ring is the day's goal, which is the only thing a stopwatch has to fill
  // — an open-ended count has no arc of its own to draw.
  const share = Math.max(0, Math.min(1, session.percent / 100));
  const radius = 52;

  return (
    <section className="tk-side tk-timer">
      <header className="tk-side-head">
        <span className="tk-side-ico is-violet" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2.5 2M9 2h6" />
          </svg>
        </span>
        <h2>Focus Timer</h2>
      </header>

      <div className="tk-dial">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="tk-dial-track" cx="60" cy="60" r={radius} pathLength={100} />
          <circle
            className="tk-dial-fill"
            cx="60"
            cy="60"
            r={radius}
            pathLength={100}
            strokeDasharray={`${(share * 100).toFixed(2)} 100`}
          />
        </svg>
        <div className="tk-dial-face">
          <strong className={hours > 0 ? 'is-long' : undefined}>
            {hours > 0 ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`}
          </strong>
          <span>{session.running ? 'Running' : seconds > 0 ? 'Paused' : 'Focus'}</span>
        </div>
      </div>

      <div className="tk-dial-tools">
        <button
          type="button"
          className="tk-play"
          aria-label={session.running ? 'Pause the session' : 'Start focusing'}
          onClick={() => (session.running ? session.stop() : session.start())}
        >
          {session.running ? (
            <svg viewBox="0 0 24 24" fill="currentColor"><rect x="7" y="6" width="4" height="12" rx="1" /><rect x="13" y="6" width="4" height="12" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l12 7-12 7z" /></svg>
          )}
        </button>
      </div>
      <p className="tk-dial-note">
        {/* No reset button, and that is deliberate: the number is the account's
            record of today, not this panel's scratch value, and a control that
            appeared to zero it would either lie or destroy real data. */}
        {Math.round(share * 100)}% of today&rsquo;s {session.goalHours}h goal
      </p>
    </section>
  );
}

// --------------------------------------------------------------------------
// What is next
// --------------------------------------------------------------------------
function Upcoming({
  tasks,
  subjectName,
  onAll,
}: {
  tasks: Task[];
  subjectName: (id: string | undefined) => string | null;
  onAll: () => void;
}) {
  return (
    <section className="tk-side">
      <header className="tk-side-head">
        <span className="tk-side-ico is-blue" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
          </svg>
        </span>
        <h2>Upcoming Tasks</h2>
        <button type="button" className="tk-side-all" onClick={onAll}>
          View all
        </button>
      </header>
      {tasks.length === 0 ? (
        <p className="tk-side-empty">Nothing dated ahead of you.</p>
      ) : (
        <ul className="tk-next">
          {tasks.map((task) => (
            <li key={task.id} className={`is-${task.priority}`}>
              <span className="tk-next-at">{timeLabel(task.due_date) ?? '—'}</span>
              <span className="tk-next-body">
                <strong>{task.title}</strong>
                <span>{subjectName(task.subject) ?? 'No subject'}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --------------------------------------------------------------------------
// Streaks
// --------------------------------------------------------------------------
/** Flames drawn per streak. Past this the row would be a wall of emoji. */
const FLAMES = 7;

function Streaks({ rows, onAll }: { rows: Streak[]; onAll: () => void }) {
  return (
    <section className="tk-side">
      <header className="tk-side-head">
        <span className="tk-side-ico is-amber" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M12 3s5 4 5 8a5 5 0 0 1-10 0c0-1.5 1-3 1-3s.5 2 2 2c0-3 2-7 2-7z" />
          </svg>
        </span>
        <h2>Task Streaks</h2>
        <button type="button" className="tk-side-all" onClick={onAll}>
          View all
        </button>
      </header>
      {rows.length === 0 ? (
        <p className="tk-side-empty">
          Nothing on a run yet. Two days together starts one.
        </p>
      ) : (
        <ul className="tk-streaks">
          {rows.map((row) => (
            <li key={row.title}>
              <span className="tk-streak-name" title={row.title}>
                {row.title}
              </span>
              <span className="tk-streak-days">{row.days} days</span>
              <span className="tk-streak-flames" aria-hidden="true">
                {Array.from({ length: FLAMES }, (_, index) => (
                  <i key={index} className={index < row.days ? 'is-lit' : undefined}>
                    <Icon name="flame" />
                  </i>
                ))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// --------------------------------------------------------------------------
// Quick add
// --------------------------------------------------------------------------
/**
 * One line in, one task out.
 *
 * The four buttons set the fields a task most often needs and the box sets the
 * name, which is the split that keeps this to one line: anything needing a form
 * belongs behind New Task, and anything needing nothing belongs here.
 */
function QuickAdd({
  busy,
  defaultPriority,
  onAdd,
  onOpenFull,
}: {
  busy: boolean;
  /** Where the priority button starts, and what it returns to after a task.
      From Settings, Tasks — which has always described this control as the one
      it sets, while this started every task at medium regardless. */
  defaultPriority: 'high' | 'medium' | 'low';
  onAdd: (name: string, due: string | null, priority: 'high' | 'medium' | 'low') => void;
  onOpenFull: () => void;
}) {
  const [name, setName] = useState('');
  const [when, setWhen] = useState<'none' | 'today' | 'tomorrow'>('none');
  const [priority, setPriority] = useState(defaultPriority);

  // The preferences land after the page does, so the button has usually been
  // built before the account's answer is known. It follows until it is pressed
  // — `send` resets to the preference too, which is the same rule.
  const touched = useRef(false);
  useEffect(() => {
    if (!touched.current) setPriority(defaultPriority);
  }, [defaultPriority]);

  const send = () => {
    const title = name.trim();
    if (!title || busy) return;
    const at = new Date();
    if (when === 'tomorrow') at.setDate(at.getDate() + 1);
    onAdd(title, when === 'none' ? null : at.toISOString().slice(0, 10), priority);
    setName('');
    setWhen('none');
    touched.current = false;
    setPriority(defaultPriority);
  };

  const dates: Array<{ key: typeof when; label: string }> = [
    { key: 'today', label: 'Today' },
    { key: 'tomorrow', label: 'Tomorrow' },
  ];

  return (
    <section className="tk-side">
      <header className="tk-side-head">
        <span className="tk-side-ico is-violet" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M13 2L4 14h6l-1 8 9-12h-6z" />
          </svg>
        </span>
        <h2>Quick Add</h2>
      </header>

      <input
        className="tk-quick-box"
        value={name}
        placeholder="What needs to get done?"
        aria-label="New task"
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') send();
        }}
      />

      <div className="tk-quick-tools">
        {dates.map((entry) => (
          <button
            key={entry.key}
            type="button"
            className={`tk-quick-tool${when === entry.key ? ' is-on' : ''}`}
            title={`Due ${entry.label.toLowerCase()}`}
            onClick={() => setWhen(when === entry.key ? 'none' : entry.key)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="3" y="5" width="18" height="16" rx="2" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            <span className="tk-sr">{entry.label}</span>
          </button>
        ))}

        <button
          type="button"
          className={`tk-quick-tool is-${priority}`}
          title={`Priority: ${priority}`}
          onClick={() => {
            touched.current = true;
            setPriority(priority === 'medium' ? 'high' : priority === 'high' ? 'low' : 'medium');
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
            <path d="M5 21V4h11l-1.5 3.5L16 11H5" />
          </svg>
          <span className="tk-sr">Priority</span>
        </button>

        <button type="button" className="tk-quick-tool" title="More fields" onClick={onOpenFull}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v8M8 12h8" />
          </svg>
          <span className="tk-sr">More fields</span>
        </button>

        <button
          type="button"
          className="tk-quick-send"
          disabled={busy || name.trim() === ''}
          aria-label="Add this task"
          onClick={send}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M4 12l16-8-6 16-2.5-6z" />
          </svg>
        </button>
      </div>
    </section>
  );
}

// --------------------------------------------------------------------------
export interface SidebarProps {
  username: string | null;
  upcoming: Task[];
  streaks: Streak[];
  busy: boolean;
  /** What Quick Add's priority button starts on. From Settings, Tasks. */
  defaultPriority: 'high' | 'medium' | 'low';
  subjectName: (id: string | undefined) => string | null;
  onAdd: (name: string, due: string | null, priority: 'high' | 'medium' | 'low') => void;
  onOpenFull: () => void;
  onShowUpcoming: () => void;
  onShowStreaks: () => void;
}

export function Sidebar(props: SidebarProps) {
  return (
    <aside className="tk-rail">
      <FocusTimer username={props.username} />
      <Upcoming
        tasks={props.upcoming}
        subjectName={props.subjectName}
        onAll={props.onShowUpcoming}
      />
      <Streaks rows={props.streaks} onAll={props.onShowStreaks} />
      <QuickAdd
        busy={props.busy}
        defaultPriority={props.defaultPriority}
        onAdd={props.onAdd}
        onOpenFull={props.onOpenFull}
      />
    </aside>
  );
}
