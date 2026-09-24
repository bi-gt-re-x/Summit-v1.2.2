/**
 * The line at the foot of the dashboard.
 *
 * It renders a quote immediately and replaces it when the fetch lands, rather
 * than rendering nothing and waiting. The quote is the least important thing
 * on the page — a spinner where a line of text should be, or a footer that
 * pops into existence a second late and shifts the page under the reader, both
 * cost more than they buy. So the built-in line is the first paint and the
 * fetched one is an improvement on it.
 *
 * The markup keeps `.quote-container` and `#dailyQuote` because the hidden
 * quote's stylesheet is written against exactly those — the HIDDEN QUOTE
 * EASTER EGG block in styles/dashboard.css. This line is what the hidden chain
 * replaces, and the small mark above it is the way in: ten clicks on it in the
 * dark. Both ends live in hooks/useQuoteEgg.ts.
 *
 * The quote element deliberately takes no `className`. The egg restarts CSS
 * animations on it by hand, and React must not be holding the other end of the
 * class attribute while it does — see the note in the hook. The mark carries
 * one, but a constant one: React writes `quote-mark` on the first render and
 * has nothing to change on any later one, so the class the egg adds and
 * removes beside it is never overwritten.
 */
import { useEffect, useState } from 'react';

import { useQuoteEgg } from '@/hooks/useQuoteEgg';
import { quote as quoteService } from '@/services';

/** Shown on first paint, and if the call never lands. */
const PLACEHOLDER = {
  quote: 'The secret of getting ahead is getting started.',
  author: 'Mark Twain',
};

export function DailyQuote() {
  const [line, setLine] = useState(PLACEHOLDER);
  const { clue, containerClass, quoteRef, markRef, onMarkClick } = useQuoteEgg();

  useEffect(() => {
    let live = true;

    void quoteService
      .daily()
      .then((result) => {
        // Guards a fetch that lands after the page has moved on. A fetch that
        // lands after the egg has claimed the line needs no guard: `clue`
        // below wins over `line` whenever it is set, so the daily quote can
        // arrive whenever it likes and simply not be the thing on screen.
        if (!live) return;
        if (!result.success || !result.quote) return;
        setLine({ quote: result.quote, author: result.author });
      })
      .catch(() => {
        /* offline: the placeholder is already on screen and is the fallback */
      });

    return () => {
      live = false;
    };
  }, []);

  return (
    <div className={`quote-container${containerClass}`}>
      {/* No role, no tabIndex, no alt text and no pointer cursor: this is
          where the hidden chain starts, and a mark that announced itself as a
          button would be advertising it. What it looks like is the sign-off
          at the foot of the page, and for anybody not counting to ten that is
          all it is. Decorative to a screen reader for the same reason — the
          quote below is the content here, and the mark says nothing the
          wordmark in the rail has not already said. */}
      <img
        className="quote-mark"
        src="/static/images/logo.svg"
        alt=""
        width={18}
        height={18}
        ref={markRef}
        onClick={onMarkClick}
      />
      <p id="dailyQuote" ref={quoteRef}>
        {clue ?? `“${line.quote}” - ${line.author}`}
      </p>
    </div>
  );
}
