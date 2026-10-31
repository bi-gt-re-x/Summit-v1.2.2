/**
 * Mango saying a page just opened.
 *
 * Pages open one at a time as days with a finished task add up (utils/starter).
 * The first time the count reaches one, this card says so, in the corner, with
 * no dark-out: it's good news, not a lesson. "Show me" goes to the page, where
 * its own guide takes over (pageTours.ts). "Later" just closes it. Either way
 * the page is added to `features_open`, which is what stops it being said
 * twice. When a few open at once (an account restarted as a beginner), one
 * card names them all.
 *
 * It waits while a tour, a focus session or a skill check is on screen.
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useStarter } from '@/hooks/useStarter';
import { useSittingShown } from '@/components/Timer/FocusSitting';
import { useCheckShown } from '@/components/SkillTree/checkShown';
import { MangoFigure } from './Mango';
import { useTourShowing } from './Tutorial';

const listOf = (names: string[]) =>
  names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

export function Unlocked() {
  const { status, profileComplete } = useAuth();
  const starter = useStarter();
  const touring = useTourShowing();
  const sitting = useSittingShown();
  const checking = useCheckShown();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const opened = starter.unannounced;
  const first = opened[0];
  if (status !== 'signed-in' || !profileComplete || !first || touring || sitting || checking) return null;

  const close = async (go: boolean) => {
    setBusy(true);
    await starter.open(...opened.map((feature) => feature.id));
    setBusy(false);
    if (go) navigate(first.to);
  };

  const names = listOf(opened.map((feature) => feature.name));
  return (
    <div className="tut-root tut-unlocked">
      <section className="tut-card" role="dialog" aria-labelledby="tut-unlocked-title">
        <span className="tut-unlocked-mango">
          <MangoFigure arm={-40} mouth="o" />
        </span>
        <p className="tut-count">
          {starter.taskDays} {starter.taskDays === 1 ? 'day' : 'days'} of tasks
        </p>
        <h2 id="tut-unlocked-title">{names} {opened.length === 1 ? 'is' : 'are'} open!</h2>
        <p>{first.what}</p>
        <div className="tut-actions">
          <button type="button" className="tut-skip" disabled={busy} onClick={() => void close(false)}>
            Later
          </button>
          <button type="button" className="tut-next" disabled={busy} onClick={() => void close(true)}>
            Show me
          </button>
        </div>
      </section>
    </div>
  );
}
