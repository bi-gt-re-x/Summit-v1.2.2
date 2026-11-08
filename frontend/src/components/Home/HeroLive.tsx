/**
 * The hero's picture: Summit open on a laptop, being used.
 *
 * It used to be two cards of numbers beside the headline (a Daily XP chart and
 * the growth rating), which told a stranger what the app measures but never
 * showed anyone using it. This plays a short evening of work instead. A cursor
 * checks off a task, the XP lands on the bar, the daily goal fills and the
 * streak goes up. Then it starts a focus session and checks off another task.
 *
 * One made-up student, and every number on the page is read off them, so no
 * two cards can disagree. Six weeks at about 60 XP a day and six at about 145
 * is 8,610 XP; level N costs N x 100 (utils/format), so that's level 13 with
 * 810 of 1,300 in hand. The last thirty days at ~145 a day is ~4,350 XP, or
 * 142 tasks at ~30 each. The work score is the Analytics section's five
 * factors averaged: 83, a B. Change one of these and change the rest with it.
 * Here they have a 12-day streak that becomes 13 with the first task of the
 * day, and the 100 XP "Steady" goal from the sign-up flow
 * (components/Auth/AuthFlow). Task XP follows the task demo further down.
 *
 * It's a drawing in HTML and CSS rather than a video, so it's sharp at every
 * size, works in both themes and costs a few KB instead of a few MB. It plays
 * only while on screen, and with reduced motion it holds its finished frame.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Icon } from '@/components/Icon';
import { onView, reduced } from '@/utils/homePlay';

const TASKS = [
  { name: 'Spanish vocab', subject: 'Spanish', xp: 30 },
  { name: 'Physics problem set', subject: 'Physics', xp: 80 },
  { name: 'Read chapter 4 for English', subject: 'English', xp: 40 },
  { name: 'Calc quiz review', subject: 'Calculus', xp: 60 },
] as const;

/** Level 13 costs 1,300 XP; the student starts with 810 of it. */
const LEVEL_COST = 1300;
const LEVEL_START = 810;
const DAILY_GOAL = 100;

/*
 * The script, one beat a second:
 *
 *   0  cursor parked        5  cursor to Start      9   clicks task 2
 *   1  cursor to task 1     6  clicks it, timer on  10  holds (the rest frame)
 *   2  clicks it            7  timer runs           11  holds
 *   3  toast                8  cursor to task 2     12  fades and starts over
 *   4  holds
 */
const BEATS = 13;
const BEAT_MS = 1000;
const REST = 10;
const CLICKS = new Set([2, 6, 9]);

type Target = 'park' | 'task1' | 'start' | 'task2';

function targetAt(beat: number): Target {
  if (beat >= 1 && beat <= 4) return 'task1';
  if (beat >= 5 && beat <= 7) return 'start';
  if (beat >= 8 && beat <= 11) return 'task2';
  return 'park';
}

/** Ticks while the drawing is on screen and holds REST otherwise. */
function useBeat(ref: RefObject<HTMLElement | null>): number {
  const [beat, setBeat] = useState(REST);
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
        setBeat(0);
        timer = setInterval(() => setBeat((b) => (b + 1) % BEATS), BEAT_MS);
      },
      reset: () => {
        stop();
        setBeat(REST);
      },
    });
    return () => {
      undo();
      stop();
    };
  }, [ref]);
  return beat;
}

function clock(seconds: number): string {
  const left = 25 * 60 - seconds;
  return `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
}

export function HeroLive() {
  const frame = useRef<HTMLDivElement>(null);
  const screen = useRef<HTMLDivElement>(null);
  const spots = useRef<Partial<Record<Target, HTMLElement | null>>>({});
  const beat = useBeat(frame);

  const done1 = beat >= 2;
  const done2 = beat >= 9;
  const timing = beat >= 6;
  const seconds = timing ? beat - 5 : 0;
  const earned = 30 + (done1 ? 80 : 0) + (done2 ? 40 : 0);
  const levelXp = LEVEL_START + earned - 30;
  const goalHit = earned >= DAILY_GOAL;
  const streak = done1 ? 13 : 12;
  const toast = beat >= 2 && beat <= 4;

  /* Where the cursor goes, measured off the real rows so it lands on the
     checkbox at any width. */
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const target = targetAt(beat);
  useLayoutEffect(() => {
    const place = () => {
      const box = screen.current?.getBoundingClientRect();
      const spot = spots.current[target]?.getBoundingClientRect();
      if (!box || !spot) return;
      setCursor({
        x: spot.left - box.left + spot.width / 2,
        y: spot.top - box.top + spot.height / 2,
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [target]);

  const done = [true, done1, done2, false];

  return (
    <div className="lp-live" ref={frame}>
      <div className="lp-live-lid">
        <div className="lp-live-screen" ref={screen}>
          <div className="lp-live-bar">
            <span className="lp-live-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="lp-live-url">Summit · Dashboard</span>
          </div>

          <div className="lp-live-app">
            <div className="lp-live-rail">
              <img src="/static/images/logo.svg" alt="" width={16} height={16} />
              <span className="is-on" />
              <span />
              <span />
              <span />
            </div>

            <div className="lp-live-main">
              <div className="lp-live-top">
                <b>Today</b>
                <span className={`lp-live-chip lp-live-streak${done1 ? ' is-up' : ''}`}>
                  <Icon name="flame" /> {streak} days
                </span>
                <span className="lp-live-level">
                  Lv 13
                  <span className="lp-live-meter">
                    <i style={{ width: `${(levelXp / LEVEL_COST) * 100}%` }} />
                  </span>
                </span>
              </div>

              <div className="lp-live-grid">
                <div className="lp-live-card lp-live-tasks">
                  <div className="lp-live-head">
                    <span>Tasks</span>
                    <span className="lp-live-muted">{done.filter(Boolean).length} of 4 done</span>
                  </div>
                  <ul>
                    {TASKS.map((task, i) => (
                      <li key={task.name} className={done[i] ? 'is-done' : ''}>
                        <span
                          className="lp-live-check"
                          ref={(el) => {
                            if (i === 1) spots.current.task1 = el;
                            if (i === 2) spots.current.task2 = el;
                          }}
                        >
                          {done[i] && <Icon name="check" />}
                        </span>
                        <span className="lp-live-name">
                          {task.name}
                          <small>{task.subject}</small>
                        </span>
                        <span className="lp-live-xp">+{task.xp}</span>
                        {/* Keyed on the beat it was earned, so it floats once
                            per run and not on every re-render. */}
                        {((i === 1 && beat === 2) || (i === 2 && beat === 9)) && (
                          <span className="lp-live-float" key={beat}>
                            +{task.xp} XP
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                  <div className={`lp-live-goal${goalHit ? ' is-hit' : ''}`}>
                    <span>
                      Daily goal <b>{earned}</b> / {DAILY_GOAL} XP
                    </span>
                    <span className="lp-live-meter lp-live-goal-meter">
                      <i style={{ width: `${Math.min(100, (earned / DAILY_GOAL) * 100)}%` }} />
                    </span>
                  </div>
                </div>

                <div className="lp-live-card lp-live-focus">
                  <div className="lp-live-head">
                    <span>Focus</span>
                    {timing && <span className="lp-live-live">On</span>}
                  </div>
                  <div className={`lp-live-ring${timing ? ' is-on' : ''}`}>
                    <svg viewBox="0 0 64 64" aria-hidden="true">
                      <circle cx="32" cy="32" r="28" className="lp-live-ring-track" />
                      <circle
                        cx="32"
                        cy="32"
                        r="28"
                        className="lp-live-ring-fill"
                        style={{ strokeDashoffset: 176 - (176 * seconds) / 60 }}
                      />
                    </svg>
                    <b>{clock(seconds)}</b>
                  </div>
                  <span
                    className={`lp-live-start${timing ? ' is-on' : ''}`}
                    ref={(el) => {
                      spots.current.start = el;
                    }}
                  >
                    <Icon name={timing ? 'pause' : 'play'} /> {timing ? 'Pause' : 'Start'}
                  </span>
                  <span className="lp-live-muted lp-live-for">Physics</span>
                </div>
              </div>

              <div className={`lp-live-toast${toast ? ' is-shown' : ''}`}>
                <Icon name="check" /> Goal hit. 13-day streak!
              </div>
            </div>
          </div>

          <span
            className="lp-live-park"
            ref={(el) => {
              spots.current.park = el;
            }}
          />
          <span
            className={`lp-live-cursor${CLICKS.has(beat) ? ' is-click' : ''}${beat === BEATS - 1 ? ' is-gone' : ''}`}
            style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}
          >
            <svg viewBox="0 0 16 22" aria-hidden="true">
              <path d="M1 1 L1 17 L5.2 13 L8 20 L10.6 19 L7.9 12.2 L13.5 12.2 Z" />
            </svg>
          </span>
        </div>
      </div>
      <div className="lp-live-base" />
    </div>
  );
}
