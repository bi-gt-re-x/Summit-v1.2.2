/**
 * The live demo: a miniature of the dashboard you can press.
 *
 * "Today's Progress" ticks a task off — the count, its bar and the day's XP all
 * move together, the way they do on the real page — and the focus timer's
 * play button runs the clock. Nothing here touches an account; it is a toy
 * with the app's shape, said as much in the section beside it.
 */
import { useEffect, useState } from 'react';
import {
  Award,
  BarChart3,
  CalendarDays,
  Flag,
  LayoutDashboard,
  NotebookPen,
  Pause,
  Play,
  Target,
  TrendingUp,
} from 'lucide-react';
import { STUDENT, partOfDay } from './data';

const NAV = [
  { label: 'Dashboard', icon: LayoutDashboard },
  { label: 'Calendar', icon: CalendarDays },
  { label: 'Goals', icon: Target },
  { label: 'Milestones', icon: Flag },
  { label: 'Analytics', icon: BarChart3 },
  { label: 'Growth', icon: TrendingUp },
  { label: 'Records', icon: Award },
  { label: 'Notes', icon: NotebookPen },
];

const TASKS = 8;
const XP_PER_TASK = 25;
const SESSION = 25 * 60;

export function MiniApp({ name }: { name: string | null }) {
  const [done, setDone] = useState(6);
  const [bumped, setBumped] = useState(0);
  const [left, setLeft] = useState(SESSION);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return undefined;
    const tick = window.setInterval(() => {
      setLeft((was) => {
        if (was <= 1) {
          setRunning(false);
          return SESSION;
        }
        return was - 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [running]);

  const finish = () => {
    if (done >= TASKS) return;
    setDone((was) => was + 1);
    setBumped((was) => was + 1);
  };

  const xp = 200 + (done - 6) * XP_PER_TASK;
  const ring = 2 * Math.PI * 28;
  const clock = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="ld-card ld-app">
      <aside className="ld-app-side" aria-hidden="true">
        <div className="ld-app-brand">
          <img src="/static/images/logo.svg" alt="" /> Summit
        </div>
        <ul className="ld-app-nav">
          {NAV.map(({ label, icon: Glyph }, at) => (
            <li key={label} className={at === 0 ? 'is-on' : undefined}>
              <Glyph strokeWidth={2} /> {label}
            </li>
          ))}
        </ul>
      </aside>

      <div className="ld-app-main">
        <div>
          <p className="ld-app-hello">{name ? `${partOfDay()}, ${name}` : partOfDay()}</p>
          <p className="ld-app-date">Today, {today}</p>
        </div>

        <div className="ld-app-row">
          <button
            type="button"
            className="ld-tick"
            onClick={finish}
            disabled={done >= TASKS}
            aria-label={`Today's progress: ${done} of ${TASKS} tasks. Tick one off.`}
          >
            <p className="ld-app-label">Today&apos;s Progress</p>
            <span className="ld-tick-count">
              {done}/{TASKS}
              <small>tasks completed</small>
            </span>
            <div className="ld-bar">
              <i style={{ width: `${(done / TASKS) * 100}%` }} />
            </div>
            <span className="ld-tick-hint">
              {done >= TASKS ? 'All done for today ✓' : 'Click to tick one off →'}
            </span>
          </button>

          <div className="ld-app-tile ld-timer">
            <p className="ld-app-label">Focus Timer</p>
            <div className="ld-timer-ring">
              <svg viewBox="0 0 64 64" aria-hidden="true">
                <circle cx="32" cy="32" r="28" fill="none" stroke="var(--ld-line-soft)" strokeWidth="5" />
                <circle
                  cx="32"
                  cy="32"
                  r="28"
                  fill="none"
                  stroke="var(--ld-blue)"
                  strokeWidth="5"
                  strokeLinecap="round"
                  strokeDasharray={ring}
                  strokeDashoffset={ring * (1 - left / SESSION)}
                  style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
              </svg>
              <span>{clock}</span>
            </div>
            <button
              type="button"
              className="ld-timer-go"
              aria-label={running ? 'Pause the timer' : 'Start the timer'}
              onClick={() => setRunning((was) => !was)}
            >
              {running ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
            </button>
          </div>
        </div>

        <div>
          <p className="ld-app-label">Quick Stats</p>
          <div className="ld-quick">
            <div>
              <span>Daily XP</span>
              <strong key={`xp-${bumped}`} className={bumped ? 'ld-bump' : undefined}>
                +{xp}
              </strong>
            </div>
            <div>
              <span>Streak</span>
              <strong>{STUDENT.streak} days</strong>
            </div>
            <div>
              <span>Level</span>
              <strong>{STUDENT.level}</strong>
            </div>
            <div>
              <span>Growth Rating</span>
              <strong>{STUDENT.growth}</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
