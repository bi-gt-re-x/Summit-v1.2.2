/**
 * "Your next session" — the plan for the open tree, above the canvas.
 *
 * The server reads your answers in this tree and its prerequisites and writes
 * the plan (backend/tracking/skill_plan.py): one session of a few blocks, and
 * the other suggestions behind it. This draws it, lets each block point at its
 * skill on the canvas, does the tree's due reviews in place, and books the
 * session on the calendar.
 *
 * Folded, it's one line, because the page keeps the canvas above the fold.
 * Whether it's open is remembered per account in this browser.
 */
import { useCallback, useEffect, useState } from 'react';
import { ReviewList } from '@/components/Review/ReviewList';
import {
  bookSkillSession,
  skillPlan,
  type SkillPlan,
  type Suggestion,
  type SuggestionKind,
} from '@/services/skillPlan';
import '@/styles/review.css';

const KIND_LABEL: Record<SuggestionKind, string> = {
  review: 'Redo',
  'step-back': 'Step back',
  'ease-off': 'Ease off',
  harder: 'Move up',
  continue: 'Keep going',
  ready: 'Ready',
  start: 'Start',
  cold: 'Warm up',
};

const OPEN_KEY = 'summit.treePlan.open';

/** How long the last "Back in 3 days" stays up before the plan reads again. */
const REREAD_MS = 1800;

function readOpen(username: string | null): boolean {
  try {
    return window.localStorage.getItem(`${OPEN_KEY}.${username ?? ''}`) !== 'no';
  } catch {
    return true;
  }
}

function writeOpen(username: string | null, open: boolean) {
  try {
    window.localStorage.setItem(`${OPEN_KEY}.${username ?? ''}`, open ? 'yes' : 'no');
  } catch {
    /* Private window: it just opens next time. */
  }
}

/** "Tue 4:15 PM", for the booked note. */
function when(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  const day = at.toLocaleDateString('en-US', { weekday: 'short' });
  const time = at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} ${time}`;
}

function Block({
  block,
  onPick,
  plan,
  onAllAnswered,
}: {
  block: Suggestion;
  onPick: (nodeId: string) => void;
  plan: SkillPlan;
  /** Every due review in this list answered: time to read the plan again. */
  onAllAnswered: () => void;
}) {
  const [reviewing, setReviewing] = useState(false);
  const [answered, setAnswered] = useState(0);
  const onAnswered = () => {
    const now = answered + 1;
    setAnswered(now);
    if (now >= plan.due.length) onAllAnswered();
  };
  return (
    <li className={`tp-block is-${block.kind}`}>
      <span className="tp-tag">{KIND_LABEL[block.kind]}</span>
      <div className="tp-body">
        <p className="tp-title">{block.title}</p>
        <p className="tp-why">{block.because}</p>
        <div className="tp-acts">
          {block.kind === 'review' && plan.due.length > 0 && (
            <button type="button" className="rq-link is-strong" onClick={() => setReviewing((was) => !was)}>
              {reviewing ? 'Hide them' : 'Do them here'}
            </button>
          )}
          {block.kind !== 'review' && block.node_id && (
            <button type="button" className="rq-link is-strong" onClick={() => onPick(block.node_id as string)}>
              Show it on the tree
            </button>
          )}
          {block.level_word && block.kind !== 'review' && (
            <span className="tp-level">{block.level_word} problems</span>
          )}
        </div>
        {reviewing && <ReviewList items={plan.due} onAnswered={onAnswered} />}
      </div>
      <span className="tp-mins">{block.minutes}m</span>
    </li>
  );
}

export interface TreePlanProps {
  tree: string;
  username: string | null;
  /** Bumped when practice changes on the page, so the plan reads again. */
  version?: number;
  /** Select a skill on the canvas and bring it into view. */
  onPick: (nodeId: string) => void;
}

export function TreePlan({ tree, username, version = 0, onPick }: TreePlanProps) {
  const [plan, setPlan] = useState<SkillPlan | null>(null);
  const [budget, setBudget] = useState(30);
  const [open, setOpen] = useState(() => readOpen(username));
  const [booking, setBooking] = useState<'idle' | 'busy'>('idle');
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await skillPlan(tree, budget);
    setPlan(result.success ? result : null);
  }, [tree, budget]);

  useEffect(() => {
    void load();
  }, [load, version]);

  useEffect(() => {
    setNote(null);
  }, [tree]);

  useEffect(() => {
    setOpen(readOpen(username));
  }, [username]);

  if (!plan || plan.tree !== tree || plan.session.blocks.length === 0) return null;

  const toggle = () => {
    setOpen((was) => {
      writeOpen(username, !was);
      return !was;
    });
  };

  const book = async () => {
    setBooking('busy');
    setNote(null);
    const result = await bookSkillSession(tree, budget);
    setBooking('idle');
    setNote(
      result.success
        ? `Booked for ${when(result.start)}. It's on your calendar.`
        : result.message ?? "That didn't book. Try again.",
    );
  };

  const inSession = new Set(plan.session.blocks.map((block) => `${block.kind}:${block.node_id}`));
  const more = plan.suggestions.filter((item) => !inSession.has(`${item.kind}:${item.node_id}`));
  const summary = plan.session.blocks.map((block) => block.title).join(', then ');

  return (
    <section className={`tp${open ? ' is-open' : ''}`} aria-label="Your next session">
      <div className="tp-head">
        <button type="button" className="tp-toggle" aria-expanded={open} onClick={toggle}>
          <span className="tp-name">Your next session</span>
          <span className="tp-sum">
            {plan.session.minutes} min · {summary}
          </span>
        </button>
        <div className="tp-tools">
          <div className="tp-budget" role="group" aria-label="How long">
            {plan.budgets.map((minutes) => (
              <button
                key={minutes}
                type="button"
                className={`tp-chip${minutes === budget ? ' is-on' : ''}`}
                aria-pressed={minutes === budget}
                onClick={() => setBudget(minutes)}
              >
                {minutes}m
              </button>
            ))}
          </div>
          <button type="button" className="tp-book" disabled={booking === 'busy'} onClick={() => void book()}>
            {booking === 'busy' ? 'Booking…' : 'Book it'}
          </button>
        </div>
      </div>
      {note && <p className="tp-note">{note}</p>}

      {open && (
        <>
          <ol className="tp-blocks">
            {plan.session.blocks.map((block) => (
              <Block
                key={`${block.kind}:${block.node_id}`}
                block={block}
                plan={plan}
                onPick={onPick}
                onAllAnswered={() => window.setTimeout(() => void load(), REREAD_MS)}
              />
            ))}
          </ol>
          {more.length > 0 && (
            <details className="tp-more">
              <summary>
                {more.length} more {more.length === 1 ? 'idea' : 'ideas'} for {plan.title}
              </summary>
              <ul>
                {more.map((item) => (
                  <li key={`${item.kind}:${item.node_id}`}>
                    <span className="tp-tag">{KIND_LABEL[item.kind]}</span>
                    <div>
                      <p className="tp-title">
                        {item.node_id ? (
                          <button type="button" className="rq-link is-strong" onClick={() => onPick(item.node_id as string)}>
                            {item.title}
                          </button>
                        ) : (
                          item.title
                        )}
                      </p>
                      <p className="tp-why">{item.because}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="tp-foot">
            {plan.practiced === 0
              ? `Nothing practiced in ${plan.title} yet. This plan fills in as you answer problems.`
              : `You've practiced ${plan.practiced} of ${plan.skills} skills here, and ${
                  plan.got === 0 ? 'none are solid yet' : plan.got === 1 ? '1 is solid' : `${plan.got} are solid`
                }. The plan comes from your answers.`}
          </p>
        </>
      )}
    </section>
  );
}
