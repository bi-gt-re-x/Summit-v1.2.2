/**
 * The three counts at the top of a subject, before anything is interpreted.
 *
 * ## What they are for
 *
 * The standing card above these states a score and a verdict, both of which
 * need ratings behind them. These need nothing: they are counts, they are
 * true from the first task, and they are what a reader coming to a page
 * about one subject arrives wanting — how much is there, am I still going,
 * and what should I be working on.
 *
 * ## There were four
 *
 * "Completed" was the fourth, and it printed the same figure the ring above
 * prints under itself — forty pixels apart, on the same screen, in the same
 * window. One number, twice, which is the thing this page has spent three
 * passes getting rid of.
 *
 * Its change chip was worth keeping, so it moved to the tasks card, where
 * the drawing had it in the first place: a percentage against the window
 * before, on the count it is a change in. What did not survive is the
 * completion rate — finished over filed is a fact about the pile rather
 * than about the work, and the task board answers it.
 *
 * ## Why the last one is not a count
 *
 * "Focus area" is the bottleneck, named from the arithmetic in
 * ./objective — the one judgement this page makes. It used to have a whole
 * panel of its own, with its evidence, its reading and what it ruled out,
 * sitting under three evidence cards arguing the same finding. The panel is
 * gone; the name is the most useful line in it and it belongs where the eye
 * lands first.
 *
 * The confidence goes with the panel. A bottleneck named at 0.45 and a
 * bottleneck named at 0.8 are the same instruction to a reader looking at a
 * card, and a card that hedges is a card nobody acts on. Where the naming is
 * too weak to make, `bottleneckFrom` returns null and this draws the honest
 * alternative rather than a hedge.
 *
 * ## Deltas, and when there is not one
 *
 * Against the window immediately before, same length — the comparison the
 * rest of the page uses. All Time has no window before it by definition, and
 * a new account has nothing in the one there is, so the chip is absent rather
 * than "+0%" or "—". A chip that only ever means "ignore me" is a chip that
 * teaches the reader to ignore the ones that matter.
 */
import { Icon, type IconName } from '@/components/Icon';

export interface SubjectCardsProps {
  /** Filed under this subject in the window, finished or not. */
  total: number;
  /** The same, in the equal-length run before it. 0 when there is none. */
  totalBefore: number;
  /** Consecutive days with work here, up to today. */
  streak: number;
  /** The bottleneck's name, or '' when the record cannot name one. */
  focus: string;
}

interface Card {
  key: string;
  icon: IconName;
  tone: 'green' | 'violet' | 'rose';
  label: string;
  /** The figure, already formatted. */
  value: string;
  /** The chip beside the note, or null for no chip. */
  chip?: { text: string; way: 'up' | 'down' | 'flat' } | null;
  note: string;
}

/** A percentage change, or null when there is nothing to compare against. */
function change(now: number, before: number): number | null {
  if (before <= 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export function SubjectCards({ total, totalBefore, streak, focus }: SubjectCardsProps) {
  const moved = change(total, totalBefore);

  const cards: Card[] = [
    {
      key: 'total',
      icon: 'clipboard',
      tone: 'green',
      label: 'Total tasks',
      value: String(total),
      chip:
        moved === null
          ? null
          : {
              text: `${moved > 0 ? '+' : ''}${moved}%`,
              way: moved > 0 ? 'up' : moved < 0 ? 'down' : 'flat',
            },
      note: moved === null ? 'filed here in this window' : 'against the window before',
    },
    {
      key: 'streak',
      icon: 'flame',
      tone: 'violet',
      label: 'Current streak',
      value: String(streak),
      chip: null,
      note: streak === 1 ? 'day running here' : 'days running here',
    },
    {
      key: 'focus',
      icon: 'target',
      tone: 'rose',
      label: 'Focus area',
      /* The bottleneck, and it is a phrase rather than a figure — so the
         card drops to the size text reads at. The `is-word` class is what
         tells the stylesheet that. */
      value: focus || 'Not yet',
      chip: null,
      note: focus
        ? 'the one thing most in the way'
        : 'the record cannot name one yet',
    },
  ];

  return (
    <div className="sb-cards">
      {cards.map((card) => (
        <article
          key={card.key}
          className={`sb-card is-${card.tone}${card.key === 'focus' ? ' is-word' : ''}`}
        >
          <header>
            <span className="sb-card-mark" aria-hidden="true">
              <Icon name={card.icon} size={18} />
            </span>
            <span className="sb-card-label">{card.label}</span>
          </header>
          <strong className="sb-card-value">{card.value}</strong>
          <p className="sb-card-foot">
            {card.chip && (
              <span className={`sb-card-chip is-${card.chip.way}`}>{card.chip.text}</span>
            )}
            <span className="sb-card-note">{card.note}</span>
          </p>
        </article>
      ))}
    </div>
  );
}
