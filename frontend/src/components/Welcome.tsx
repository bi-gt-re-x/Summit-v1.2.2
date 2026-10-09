/**
 * The short tour a new account gets on its first visit.
 *
 * Five cards: hello, the three starter pages, and what happens to everything
 * else. It names the pages rather than pointing at them on screen — a tour
 * that highlights parts of the page has to know where they are on every
 * layout, and breaks quietly when one moves. Shown once (`welcome_seen`), and
 * only to an account that still has locked pages; Settings can show it again.
 * See utils/starter for the rule the last card describes.
 */
import { CalendarDays, LayoutDashboard, Sparkles, Timer, Unlock } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useSettings } from '@/hooks/useSettings';
import { useStarter } from '@/hooks/useStarter';
import { STARTER_DAYS, STARTER_LEVEL } from '@/utils/starter';
import '@/styles/starter.css';

interface Step {
  icon: ReactNode;
  title: string;
  body: string;
  /** Where "Take me there" goes, for the three page cards. */
  to?: string;
}

export function Welcome() {
  const { status } = useAuth();
  const { prefs, displayName, update } = useSettings();
  const starter = useStarter();
  const navigate = useNavigate();
  const [at, setAt] = useState(0);

  const showing = status === 'signed-in' && starter.ready && starter.stage !== 'open' && !prefs.welcome_seen;

  useEffect(() => {
    if (!showing) return undefined;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void update({ welcome_seen: true });
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [showing, update]);

  if (!showing) return null;

  const steps: Step[] = [
    {
      icon: <Sparkles />,
      title: displayName ? `Welcome to Summit, ${displayName}` : 'Welcome to Summit',
      body: 'Summit turns your work into XP, levels and streaks. There is a lot in it, so you are starting with just the three pages that make up the daily habit. It takes about thirty seconds to see them.',
    },
    {
      icon: <LayoutDashboard />,
      title: 'Dashboard',
      body: 'Your day at a glance. Add what you need to do, check it off, and watch your XP and streak grow. This is where you will spend most of your time.',
      to: '/dashboard',
    },
    {
      icon: <CalendarDays />,
      title: 'Calendar',
      body: 'Plan when the work happens. Put tasks and events on your day, week or month so nothing sneaks up on you.',
      to: '/calendar',
    },
    {
      icon: <Timer />,
      title: 'Timer',
      body: 'Sit down and focus. Focus sessions with short breaks, and every minute counts toward your daily goal.',
      to: '/timer',
    },
    {
      icon: <Unlock />,
      title: 'The rest unlocks as you go',
      body:
        starter.stage === 'starter'
          ? `Analytics, Goals, the Skill Tree, Notes and more appear in the sidebar after ${STARTER_DAYS} days, or sooner if you reach level ${STARTER_LEVEL}. Want one early? Open it any time. Summit tells you what it does first.`
          : 'Analytics, Goals, the Skill Tree, Notes and more are in the sidebar with a padlock. Each one opens with a short note on what it does, so open them when you are ready.',
    },
  ];

  const step = steps[at]!;
  const last = at === steps.length - 1;

  const finish = (to = '/dashboard') => {
    void update({ welcome_seen: true });
    navigate(to);
  };

  return (
    <div className="gs-tour-scrim" role="presentation">
      <section className="gs-tour-card" role="dialog" aria-modal="true" aria-labelledby="gs-tour-title">
        <button type="button" className="gs-tour-skip" onClick={() => finish()}>
          Skip
        </button>
        <span className="gs-tour-icon" aria-hidden="true">{step.icon}</span>
        <h2 id="gs-tour-title">{step.title}</h2>
        <p>{step.body}</p>

        <div className="gs-tour-dots" aria-label={`Step ${at + 1} of ${steps.length}`}>
          {steps.map((one, index) => (
            <i key={one.title} className={index === at ? 'is-on' : ''} />
          ))}
        </div>

        <div className="gs-tour-actions">
          {at > 0 && (
            <button type="button" className="gs-btn" onClick={() => setAt(at - 1)}>
              Back
            </button>
          )}
          {step.to && (
            <button type="button" className="gs-btn" onClick={() => finish(step.to)}>
              Take me there
            </button>
          )}
          <button
            type="button"
            className="gs-btn is-primary"
            onClick={() => (last ? finish() : setAt(at + 1))}
            autoFocus
          >
            {last ? 'Start on the dashboard' : 'Next'}
          </button>
        </div>
      </section>
    </div>
  );
}
