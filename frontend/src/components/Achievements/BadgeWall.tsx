/**
 * The badge wall — the Badges tab of the Records page.
 *
 * It was a page of its own, Achievements, and it asked the question Records
 * already asks: how far have I come. One page with three tabs now answers it,
 * under one hero; this is the third tab.
 *
 * A wall of badges, arranged so that a reader meets them in the order the
 * questions arrive: how far am I, what did I just get, which kinds am I behind
 * on, what is next in the trees, and then the whole list.
 *
 *     the ring and three figures   how far along the wall is, and the streak
 *     Recently Earned              the last four, largest — the news
 *     Achievement Categories       one bar per heading
 *     Skill Trees                  the six tree ladders, and the way in
 *     All Achievements             the wall, in two grids: still to earn, then
 *                                  earned
 *
 * ## The wall is split, and neither half is behind a control
 *
 * "Still to earn · 32" and "Earned · 68", one grid each, both always drawn.
 * A single list sorted by difficulty answers "how hard is this badge" — a
 * question nobody arrives with — while burying the two the reader did come
 * for: what is next, and what have I got. Splitting it answers both in the
 * headings before a tile is read.
 *
 * ## What is still out there comes first
 *
 * The unearned half leads. Both halves are worth drawing, but only one of them
 * can be acted on: "Still to earn" sorted easiest-and-nearest-first is a list
 * of things to go and do, and the top of it is literally the next one. The
 * earned half is a record — it is the more pleasant half to look at and it
 * does not change what anybody does this afternoon, so it reads better as
 * what the page arrives at than as what it opens with.
 *
 * The four largest badges on the page are still the four most recently earned,
 * up at the top. Nothing about this ordering hides the good news; it stops the
 * good news from standing between the reader and the wall.
 *
 * It is a split rather than a toggle for the same reason the panels on the
 * Growth page show their charts rather than offering them: a page whose job is
 * to say where you are should not make you ask twice. The category chips and
 * the search box narrow both halves at once, so a reader filtering to Learning
 * still sees the Learning badges they have beside the ones they do not.
 *
 * ## Nothing here is computed
 *
 * The server decides what is earned and holds the date it happened. This page
 * draws what it is given. That matters for the streak badges in particular: a
 * badge earned in March is still earned in July, and a client recomputing
 * "streak >= 30" against the *current* streak would take it away again on the
 * first missed day. See the note in backend/api/achievements.py.
 *
 * The category counts and the achievement score arrive counted for the same
 * reason — two places counting the same badges is two places that can disagree
 * about a wall the reader is looking at all at once.
 *
 * ## Progress is only drawn on locked badges
 *
 * An earned badge shows the day it was earned instead. A full bar under a
 * badge that is already won is a bar nobody reads, and it takes the row's
 * width from the one thing on it that is still news.
 *
 * ## The hidden ones draw as they arrive
 *
 * A locked hidden badge arrives with no name, no threshold and no progress —
 * see the service. The page does not have to know which they are, and
 * could not leak them if it wanted to: it draws "???" because that is what it
 * was sent. What it adds is the lock styling and the line at the foot of the
 * list saying how many are still out there, which is the honest version of
 * "more achievements coming soon" — they are not coming, they are already here
 * and you have not found them.
 */
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ErrorState, Loading, RefreshButton } from '@/components';
import { CATEGORY_GLYPH, GLYPH, glyphFor } from '@/components/Achievements/glyphs';
import { useApi, useAuth, usePageEntrance } from '@/hooks';
import { achievements as service } from '@/services';
import { TREE_CATEGORY } from '@/services/achievements';
import type { Badge } from '@/services/achievements';
import '@/styles/achievements.css';

/** The filter's options. "All" first, then the seven headings, server order. */
const FILTERS = [
  'All Achievements', 'Productivity', 'Consistency', 'Learning', 'Mastery',
  'Milestones', 'Analytics', 'Special',
] as const;
type Filter = (typeof FILTERS)[number];

/** How many of the most recent earnings lead the page. */
const RECENT = 4;

function pretty(iso: string | null): string {
  if (!iso) return '';
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return '';
  return when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * "2h ago", "1d ago", "3w ago".
 *
 * Relative rather than absolute on the recent cards because the whole reason
 * they are at the top is that they are news, and "Earned 2h ago" is news in a
 * way that "Earned 28 Apr" is not. The list below prints the date, which is
 * the right form for a row somebody is scrolling past.
 */
function ago(iso: string | null): string {
  if (!iso) return '';
  const when = new Date(iso).getTime();
  if (Number.isNaN(when)) return '';
  const mins = Math.max(0, Math.round((Date.now() - when) / 60000));
  if (mins < 60) return `${mins || 1}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return pretty(iso);
}

/**
 * A badge's mark: a hexagon, the thing the badge is about, and its rank.
 *
 * One shape for every badge and the tier carried in its colour, so a reader
 * scanning the wall reads difficulty from the hue rather than from a word. The
 * hexagon rather than a circle because the wall is the one page in this app
 * that is allowed to look like a game.
 *
 * ## The drawing is the badge's, earned or not
 *
 * It used to be a tick once a badge was won. That made the picture a report on
 * the reader rather than a picture of the badge, and on an account with
 * seventy earned it turned two thirds of the wall into the same drawing
 * repeated. Earning is said by the tint, the solid rim and the rosette in the
 * corner; the hexagon keeps saying what the badge is. The padlock survives for
 * the one case where it is the whole truth: a hidden badge nobody has been
 * told the shape of.
 *
 * ## Pips are the rung
 *
 * One to five, along the top edge, in the tier's own tone. The colour already
 * carries difficulty for a reader who has learned it; the pips are the same
 * fact counted, so it can be read on the first visit and off a screenshot. A
 * secret badge draws none: its tier is one more thing nobody has been told.
 */
function Mark({ badge, size }: { badge: Badge; size?: 'lg' }) {
  const secret = badge.hidden && !badge.earned;
  return (
    <span
      className={`ac-mark tier-${badge.tier}${badge.earned ? ' is-earned' : ''}${secret ? ' is-secret' : ''}${size === 'lg' ? ' is-lg' : ''}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 32 32" className="ac-mark-hex">
        <path d="M16 1.6 29 9v14L16 30.4 3 23V9z" />
      </svg>
      <svg
        viewBox="0 0 24 24"
        className="ac-mark-glyph"
        fill="none"
        stroke="currentColor"
        strokeWidth={badge.earned ? 2.1 : 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {secret ? GLYPH.lock : glyphFor(badge)}
      </svg>

      {!secret && (
        <span className="ac-pips">
          {Array.from({ length: badge.tier }, (_, index) => (
            <i key={index} />
          ))}
        </span>
      )}

      {badge.earned && (
        <span className="ac-mark-tick">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5 9.5 17 19 7.5" />
          </svg>
        </span>
      )}
    </span>
  );
}

/** One of the four cards along the top — the badges most recently earned. */
function RecentCard({ badge }: { badge: Badge }) {
  return (
    <li className={`ac-recent-card tier-${badge.tier}`}>
      <Mark badge={badge} size="lg" />
      <strong>{badge.name}</strong>
      <span className="ac-quiet">{badge.description}</span>
      <div className="ac-recent-foot">
        <span className="ac-xp">+{badge.xp_reward} XP</span>
        <span className="ac-quiet">Earned {ago(badge.earned_at)}</span>
      </div>
    </li>
  );
}

/**
 * One badge in the wall.
 *
 * A tile rather than a full-width row. The row put the mark, the name, the
 * bar and the score on one line and gave the description whatever was left,
 * which on a wide screen was one badge every sixty pixels of height and eight
 * hundred pixels of empty middle. Three or four tiles across is the same
 * the whole wall in a third of the scroll, and it puts badges beside each
 * other, which is how a wall is read — the eye compares neighbours.
 *
 * The tile is the same size earned or locked. What changes is the tint and the
 * foot: a date on one, a bar on the other. Earned tiles carry their tier's
 * colour across the whole card rather than only the hexagon, so "what have I
 * got" is answerable from across the room and before any word is read.
 */
function BadgeTile({ badge }: { badge: Badge }) {
  const secret = badge.hidden && !badge.earned;
  const share = badge.threshold > 0 ? Math.min(1, badge.value / badge.threshold) : 0;

  return (
    <li className={`ac-tile tier-${badge.tier}${badge.earned ? ' is-earned' : ''}${secret ? ' is-secret' : ''}`}>
      <Mark badge={badge} />

      <div className="ac-tile-text">
        <div className="ac-tile-top">
          <strong>{badge.name}</strong>
          {/* A secret badge's rank is withheld with the rest of it — the word
              "Legendary" beside the blanked rows would say which they are. */}
          <span className="ac-rank">{secret ? 'Hidden' : badge.tier_label}</span>
        </div>
        <span className="ac-quiet">{badge.description}</span>
        {badge.title && <em className="ac-title">Title unlocked · {badge.title}</em>}
      </div>

      <div className="ac-tile-foot">
        {badge.earned ? (
          <span className="ac-done">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12.5l2.6 2.6L16 9.5" />
            </svg>
            Earned {pretty(badge.earned_at)}
          </span>
        ) : secret ? (
          /* No bar and no figures: the server sent neither, and inventing an
             empty one would say "you are at zero" about a threshold nobody
             has been told. */
          <span className="ac-quiet ac-secret-note">Hidden until earned</span>
        ) : (
          <div className="ac-progress">
            <div className="ac-bar" role="presentation">
              <i style={{ width: `${Math.round(share * 100)}%` }} />
            </div>
            <span className="ac-quiet ac-figures">
              {badge.value.toLocaleString()} / {badge.threshold.toLocaleString()}
            </span>
          </div>
        )}

        {/* A secret badge's score is withheld with everything else about it.
            The server blanks the name, the threshold and the progress but
            still sends `xp_reward`, and printing it undoes the rest: four
            hidden tiles at +1,000 and one at +5,000 tells a reader exactly
            which of the five is the monster. */}
        {secret ? (
          <span className="ac-xp" title="Withheld until it is earned">??? XP</span>
        ) : (
          <span
            className={`ac-xp${badge.earned ? ' is-earned' : ''}`}
            title={`${badge.tier_label} · worth ${badge.xp_reward} toward your achievement score`}
          >
            +{badge.xp_reward} XP
          </span>
        )}
      </div>
    </li>
  );
}

/**
 * One half of the wall, headed by what it is and how many are in it.
 *
 * Locked and earned are drawn as two grids rather than one, in that order, and
 * neither is behind a control: a toggle would make the reader ask twice for a
 * page whose whole job is to answer "where am I" once. The heading carries the
 * count, so the split is also the tally — "Earned · 71" is the sentence the
 * ring at the top of the page draws as an arc.
 */
function Wall({ title, note, badges }: { title: string; note: string; badges: Badge[] }) {
  if (badges.length === 0) return null;
  return (
    <>
      <div className="ac-wall-head">
        <h3>
          {title} <span className="ac-wall-count">{badges.length}</span>
        </h3>
        <span className="ac-quiet">{note}</span>
      </div>
      <ul className="ac-grid">
        {badges.map((badge) => (
          <BadgeTile badge={badge} key={badge.id} />
        ))}
      </ul>
    </>
  );
}

/**
 * The skill trees, given a section of their own.
 *
 * ## Why this one heading gets more than a chip
 *
 * Every heading has a chip in the band above and a share of the wall below,
 * and for five of the seven that is the right amount of room. Mastery is the
 * exception for two reasons that have nothing to do with it being newer.
 *
 * It is the largest heading on the wall — thirty-one badges across six ladders
 * — and it is the only one whose badges are not about the app at all. Every
 * other badge is counted off something the reader did *here*: tasks finished,
 * days turned up, XP earned. These are counted off how far into a *subject*
 * the work went, against a curriculum somebody wrote, and the honest thing to
 * do with a reader who has just learned that is show them the curriculum.
 * Hence the way out at the foot of it, which is the only link on this page.
 *
 * Mixed into the wall, all of that was thirty-one tiles a reader met in tier
 * order between "Night Owl" and "Six Figures", with nothing saying they were
 * six ladders rather than a pile, and nothing saying where to go.
 *
 * ## It is a second view, not a second copy
 *
 * These badges are still in the wall below, under the filter and the search
 * like everything else. This section is the same rows arranged by the thing
 * that makes them different from each other — which ladder each is on — and
 * that is a grouping the wall cannot do without becoming six walls.
 */
function TreeWall({ badges }: { badges: Badge[] }) {
  /* The six ladders, in the order the server lists them, and each one's next
     rung. `find` over a list already sorted by threshold inside its metric —
     see the note in the Mastery block of backend/api/achievements.py, and the
     test that holds it true. */
  const ladders = useMemo(() => {
    const out = new Map<string, { rows: Badge[]; next: Badge | null; earned: number }>();
    badges.forEach((badge) => {
      const key = badge.metric || 'other';
      const entry = out.get(key) ?? { rows: [], next: null, earned: 0 };
      entry.rows.push(badge);
      if (badge.earned) entry.earned += 1;
      out.set(key, entry);
    });
    out.forEach((entry) => {
      entry.next = entry.rows.find((badge) => !badge.earned) ?? null;
    });
    return [...out.values()];
  }, [badges]);

  if (badges.length === 0) return null;

  const earned = badges.filter((badge) => badge.earned).length;

  return (
    <section className="ac-section ac-trees">
      <header className="ac-section-head">
        <h2>
          <span className="ac-trees-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              {GLYPH.lattice}
            </svg>
          </span>
          Skill Trees
        </h2>
        <span className="ac-quiet">
          {earned} / {badges.length} earned
        </span>
      </header>

      <p className="ac-trees-note">
        Counted on your own XP in the subjects that open each lattice, against what
        that lattice is worth — never on a tree&rsquo;s own drawing, which is the same on
        every account. Six ladders: how many you have touched, how far into the best
        one, how many passed half, how many you covered outright, how many fields they
        sit in, and the whole lot added up.
      </p>

      {/* One row per ladder, and the row is the next rung on it. A reader
          asking "what is next in the trees" has six answers, not one, and a
          single "next badge" line would have had to pick one of them. */}
      <ul className="ac-ladders">
        {ladders.map((ladder) => {
          const next = ladder.next;
          return (
            <li className="ac-ladder" key={ladder.rows[0]!.id}>
              <span className="ac-ladder-count">
                {ladder.earned} / {ladder.rows.length}
              </span>
              {next ? (
                <span className="ac-ladder-next">
                  <strong>{next.name}</strong>
                  <span className="ac-quiet">{next.description}</span>
                  {next.threshold > 0 && (
                    <span className="ac-bar" role="presentation">
                      <i style={{ width: `${Math.round((next.value / next.threshold) * 100)}%` }} />
                    </span>
                  )}
                  <span className="ac-quiet">
                    {next.value} / {next.threshold} {next.unit}
                  </span>
                </span>
              ) : (
                /* Every rung on this ladder is done. Saying so is the point of
                   splitting them: a reader who has topped out one of the six
                   should be able to see that without counting tiles. */
                <span className="ac-ladder-next is-done">
                  <strong>{ladder.rows[ladder.rows.length - 1]!.name}</strong>
                  <span className="ac-quiet">Every rung on this one is yours.</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      <ul className="ac-grid">
        {badges.map((badge) => (
          <BadgeTile badge={badge} key={badge.id} />
        ))}
      </ul>

      {/* The only link on the page. See the note at the top of this component
          for why this heading is the one that earns it. */}
      <p className="ac-foot">
        <Link to="/skill-trees">Open the skill trees</Link>
      </p>
    </section>
  );
}


/**
 * One of the three figures beside the ring.
 *
 * The drawing is not decoration: three numbers of the same size in a row read
 * as one table, and the reader has to get to the label under each before they
 * know which is which. A trophy, a flame and a sparkle are told apart before
 * they are read.
 */
function Stat({
  glyph,
  tone,
  value,
  label,
  note,
}: {
  glyph: ReactNode;
  tone: string;
  value: string;
  label: string;
  note: string;
}) {
  return (
    <div className={`ac-stat tone-${tone}`}>
      <div className="ac-stat-top">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {glyph}
        </svg>
        <strong>{value}</strong>
      </div>
      <span className="ac-stat-label">{label}</span>
      <span className="ac-quiet">{note}</span>
    </div>
  );
}

/** The completion ring. One arc, drawn as a stroked circle. */
function Ring({ share }: { share: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="ac-ring">
      <svg viewBox="0 0 100 100">
        <circle className="ac-ring-track" cx="50" cy="50" r={radius} />
        <circle
          className="ac-ring-arc"
          cx="50"
          cy="50"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - share)}
        />
      </svg>
      <div className="ac-ring-face">
        <strong>{Math.round(share * 100)}%</strong>
      </div>
    </div>
  );
}

export function BadgeWall() {
  // `useAuth`, not `useUserData`: this page wants a name to key its own
  // fetch on, and asking `useUserData` for one is what makes the app read the
  // account's entire task list. See hooks/useUserData.
  const { username } = useAuth();
  const call = useCallback(
    () =>
      username
        ? service.getAchievements()
        : Promise.resolve({ success: false as const, message: 'Sign in to see your badges.' }),
    [username],
  );
  const { data, error, loading, refreshing, reload } = useApi(call, [username]);

  const [filter, setFilter] = useState<Filter>('All Achievements');
  const [query, setQuery] = useState('');

  /* "View All" — clear both narrowings and go to the list. Scrolled rather
     than routed because the full list is already on this page. */
  const listRef = useRef<HTMLElement | null>(null);
  const showAll = useCallback(() => {
    setFilter('All Achievements');
    setQuery('');
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const badges = useMemo(() => data?.achievements ?? [], [data]);

  /* The last four earned, newest first. A badge with no date sorts last rather
     than being dropped: the date is written the first time a read sees it
     earned, so the only rows without one are older than that mechanism. */
  const recent = useMemo(
    () =>
      badges
        .filter((badge) => badge.earned)
        .sort((a, b) => (b.earned_at ?? '').localeCompare(a.earned_at ?? ''))
        .slice(0, RECENT),
    [badges],
  );

  /* The wall, filtered and searched — both halves of it, before the split. */
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return badges
      .filter((badge) => filter === 'All Achievements' || badge.category === filter)
      .filter(
        (badge) =>
          !needle ||
          badge.name.toLowerCase().includes(needle) ||
          badge.description.toLowerCase().includes(needle),
      );
  }, [badges, filter, query]);

  /* Earned, hardest first — within its own half, which is the second one. On
     a page that says "71 of 100" the interesting seventy-one are the Legendary
     ones, not the first afternoon's Starters, so the half opens on those. */
  const won = useMemo(
    () => shown.filter((badge) => badge.earned).sort((a, b) => b.tier - a.tier || a.name.localeCompare(b.name)),
    [shown],
  );

  /* Locked, easiest first, and within a rung the closest to done first — which
     makes the top of this half literally the answer to "what is next". A
     secret badge has no progress to sort on and arrives at 0, so the five sit
     at the bottom of the Legendary rung, which is where they belong. */
  const left = useMemo(
    () =>
      shown
        .filter((badge) => !badge.earned)
        .sort((a, b) => {
          if (a.tier !== b.tier) return a.tier - b.tier;
          const near = (badge: Badge) => (badge.threshold > 0 ? badge.value / badge.threshold : 0);
          return near(b) - near(a) || a.name.localeCompare(b.name);
        }),
    [shown],
  );

  /* The skill trees, in the order the server sends them — which is ladder
     order, and the one thing `TreeWall` cannot reconstruct from a set. Off
     `badges` rather than off `shown`: this section is not what the filter and
     the search are for, and a reader searching "streak" should not watch the
     tree section empty out beside the wall that is actually answering them. */
  const treeBadges = useMemo(
    () => badges.filter((badge) => badge.category === TREE_CATEGORY),
    [badges],
  );

  const hiddenLeft = useMemo(
    () => badges.filter((badge) => badge.hidden && !badge.earned).length,
    [badges],
  );

  /* The arrival cascade. Bound to the read rather than to mount, so it
     starts when there is something to animate — see hooks/usePageEntrance. */
  const entering = usePageEntrance(!loading);

  if (loading) return <Loading label="Reading your record" />;
  if (error && !badges.length) return <ErrorState message={error} onRetry={reload} />;

  const earned = data?.earned ?? 0;
  const total = data?.total ?? 0;
  const share = total > 0 ? earned / total : 0;

  return (
    <div className="ac-page rc-badges">
      <div className={`ac-shell${entering ? ' pg-enter' : ''}`}>
        {/* The filter and the refresh, which sat in this wall's own hero when
            it was a page. The Records hero is over it now. */}
        <header className="ac-head">
          <div className="ac-head-tools">
            <label className="ac-select">
              <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)}>
                {FILTERS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <RefreshButton busy={refreshing} onRefresh={reload} />
          </div>
        </header>

        {error && <ErrorState message={error} onRetry={reload} />}

        {/* The band. The ring is the wall; the three figures beside it are the
            account — what it has earned, whether it is still turning up, and
            what the wall scores. */}
        <section className="ac-band">
          <div className="ac-band-ring">
            <Ring share={share} />
            <span className="ac-quiet">Overall Completion</span>
          </div>

          <Stat
            glyph={GLYPH.trophy}
            tone="gold"
            value={String(earned)}
            label="Achievements Earned"
            note={`/ ${total} total`}
          />

          <Stat
            glyph={GLYPH.flame}
            tone="flame"
            value={String(data?.streak ?? 0)}
            label="Day Streak"
            note={(data?.streak ?? 0) > 0 ? 'Keep it going!' : 'Finish a task to start one'}
          />

          {/* Not the account's XP, and it does not say it is. The badges are
              weighted by difficulty and this is their sum — see the note on the
              endpoint. Printed against the full wall, because the number on its
              own says nothing, and labelled "score" rather than "XP" because a
              reader who reads it as XP will wait for a level that never comes. */}
          <Stat
            glyph={GLYPH.sparkle}
            tone="violet"
            value={(data?.achievement_xp ?? 0).toLocaleString()}
            label="Achievement Score"
            note={`of ${(data?.total_xp ?? 0).toLocaleString()} on the wall`}
          />
        </section>

        {data?.title && (
          <p className="ac-title-banner">
            You have earned the title <strong>{data.title}</strong>.
          </p>
        )}

        {recent.length > 0 && (
          <section className="ac-section">
            <header className="ac-section-head">
              <h2>Recently Earned</h2>
              {/* It goes somewhere: it clears the filter and the search and
                  puts the reader at the top of the full list, which is the only
                  honest "all" on a page whose list is already here. A link that
                  navigated away would be leaving the page it is on. */}
              <button type="button" className="ac-view-all" onClick={showAll}>
                View All
              </button>
            </header>
            <ul className="ac-recent">
              {recent.map((badge) => (
                <RecentCard badge={badge} key={badge.id} />
              ))}
            </ul>
          </section>
        )}

        <section className="ac-section">
          <header className="ac-section-head">
            <h2>Achievement Categories</h2>
          </header>
          <ul className="ac-cats">
            {(data?.categories ?? []).map((category) => (
              /* A chip is the filter it names. The row was five read-only
                 gauges sitting directly above a list with a category filter on
                 it — the control the reader wanted was already on screen and
                 not connected to the thing that looked like it. */
              <li className={`ac-cat cat-${category.name.toLowerCase()}`} key={category.name}>
                <button
                  type="button"
                  aria-pressed={filter === category.name}
                  onClick={() => setFilter(filter === category.name ? 'All Achievements' : category.name)}
                >
                  <span className="ac-cat-head">
                    <span className="ac-cat-ico" aria-hidden="true">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        {CATEGORY_GLYPH[category.name]}
                      </svg>
                    </span>
                    <span className="ac-cat-text">
                      <strong>{category.name}</strong>
                      <span className="ac-quiet">
                        {category.earned} / {category.total}
                      </span>
                    </span>
                  </span>
                  <span className="ac-bar" role="presentation">
                    <i
                      style={{
                        width: `${category.total > 0 ? Math.round((category.earned / category.total) * 100) : 0}%`,
                      }}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        {/* Above the wall, because it is a way *in* to a section of it and a
            reader who has scrolled past the whole wall has already made up
            their mind. */}
        <TreeWall badges={treeBadges} />

        <section className="ac-section" ref={listRef}>
          <header className="ac-section-head">
            <h2>All Achievements</h2>
            <label className="ac-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={query}
                placeholder="Search achievements…"
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Search achievements"
              />
            </label>
          </header>

          {shown.length === 0 ? (
            <p className="ac-empty">Nothing matches that.</p>
          ) : (
            <>
              <Wall
                title="Still to earn"
                note="Easiest first, then nearest"
                badges={left}
              />
              <Wall
                title="Earned"
                note="Hardest first"
                badges={won}
              />
            </>
          )}

          {/* The honest version of "more coming soon". They are not coming;
              they are on the wall already and have not been found. */}
          {hiddenLeft > 0 && filter === 'All Achievements' && !query && (
            <p className="ac-foot">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                <rect x="5" y="11" width="14" height="9" rx="2.5" />
                <path d="M8.5 11V8a3.5 3.5 0 017 0v3" />
              </svg>
              {hiddenLeft} hidden {hiddenLeft === 1 ? 'achievement is' : 'achievements are'} still out
              there. Nobody is told what they are.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
