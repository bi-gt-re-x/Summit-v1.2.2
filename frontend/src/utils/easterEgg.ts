/**
 * The hidden chain's storage, and nothing else.
 *
 * Two keys, and neither of them is this file's to name. The rest of the chain
 * is plain script served out of frontend/secret/ — pentagon-egg.js on the
 * landing page, void.js for the riddle, engine.js on the hidden page — and
 * every one of them builds these exact strings by hand, because a `<script
 * src>` cannot import a module. So the format below is a contract with three
 * files rather than an implementation detail: rename `easterEgg:<user>:<day>`
 * here and the pentagon stops waking up, silently, because it is still looking
 * for the old one.
 *
 * ## `currentUser`, and why React writes it
 *
 * Every one of those files identifies the account the same way: a localStorage
 * key called `currentUser`. Six readers — the four scripts, this file, and
 * frontend/secret/void.js — and until now exactly one writer:
 * frontend/secret/engine.html, which is the *last* page in the chain.
 *
 * That is one writer in the wrong place, and it made the account meaningless
 * in both directions. Before anybody reached the engine, `currentUser` was
 * unset and every account on a browser shared one progression under
 * 'Default'. After somebody reached it, the name was pinned to whoever that
 * was and never moved again — so the next person to sign in on that browser
 * was read as *them*: their day's unlock, and, fatally, their earned title.
 * A title retires the chain (`earnedTitle` below), so a second account found
 * the whole thing already over — ten clicks on the dashboard's mark doing
 * nothing, no unlock written, and the pentagon on the landing page inert
 * because it had no unlock to find. Dead, with no symptom to read.
 *
 * So `rememberAccount` writes it, from the session React already knows about,
 * on every load and every sign-in. The scripts go on reading the key they
 * always read; it is simply true now. See hooks/useChainAccount.ts.
 *
 * Every read is wrapped: localStorage throws outright in a Safari private
 * window and where site data is blocked, and a secret is not worth a blank
 * dashboard. Unreadable storage means "not unlocked", which is the state a
 * first-time reader is in.
 */

/**
 * Announced when the tenth click lands, so the quote can play its reveal.
 *
 * The same device as `summit:stats-changed` in components/Rail.tsx, for the
 * same reason: one fact, one direction, no reply. The door is the mark in the
 * corner of the Focus card and the room is the quote at the foot of the page —
 * two children of pages/Dashboard.tsx with no state between them and no reason
 * to be given any, since one of them has exactly one thing to tell the other.
 *
 * No latch goes with it any more. There was one, back when the door was the
 * rail's title and the tenth click could land on a page where the quote was
 * not mounted: the reveal had to survive a navigation, so it was owed rather
 * than played. Both ends are on the dashboard now and are on screen together,
 * so the event is heard the moment it is sent.
 */
export const EGG_UNLOCKED = 'summit:egg-unlocked';

/** Nobody signed in — the landing page's own door still works signed out. */
export const ANON = 'Default';

/**
 * Tell the chain who is signed in.
 *
 * Called with the account on every load and every change of it, so that the
 * four scripts in frontend/secret/ — which cannot ask React anything — read
 * the right person out of the only place they know to look.
 *
 * Signing out clears it rather than leaving the last name behind: a shared
 * machine should not hand the next person the previous one's progress, and
 * 'Default' is a real state, not a fallback, because the landing page's own
 * way in (frontend/secret/quote-egg.js) is open to visitors with no account.
 */
export function rememberAccount(username: string | null): void {
  try {
    if (username) localStorage.setItem('currentUser', username);
    else localStorage.removeItem('currentUser');
  } catch {
    /* storage blocked: everyone is 'Default', which is the signed-out chain */
  }
}

/**
 * Today, local, as YYYY-MM-DD.
 *
 * Built by hand rather than sliced off `toISOString()`, which is UTC: an
 * evening click in a western timezone would stamp tomorrow's key and the clue
 * would vanish at midnight UTC instead of midnight here.
 */
function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function dayKey(account: string): string {
  return `easterEgg:${account}:${today()}`;
}

/**
 * Has this account found the clue today?
 *
 * The account is passed in rather than read back out of `currentUser`, and
 * that is not tidiness. React writes that key from an effect above the router,
 * and effects run child-first — so a component asking this question in the
 * same commit that the session resolved would read the *previous* name, and
 * there is no later commit to put it right. hooks/useChainAccount.ts hands
 * every caller the answer instead, and holds them off until there is one.
 */
export function unlockedToday(account: string): boolean {
  try {
    return localStorage.getItem(dayKey(account)) === '1';
  } catch {
    return false;
  }
}

/** Remember it, so a reload keeps the clue rather than asking for ten more clicks. */
export function markUnlockedToday(account: string): void {
  try {
    localStorage.setItem(dayKey(account), '1');
  } catch {
    /* storage blocked: the clue is on screen, it just will not survive a reload */
  }
}

/**
 * The title handed out at the end of the chain, in the hidden ADMIN ROOM —
 * written by frontend/secret/hidden-engine.js.
 *
 * It is the chain's terminator: once a title has been earned the clue has done
 * its job and the dashboard goes back to reading normally.
 *
 * That script writes a second key at the same moment — the rail's chosen
 * title, so the prize is worn and not merely offered. utils/rankTitle.ts owns
 * that one and explains it.
 */
export function earnedTitle(account: string): string | null {
  return carriedOver(`summitTitle:${account}`, `ascenTitle:${account}`);
}

/**
 * A stored value read under its current name, or moved there from its old one.
 *
 * The two keys the secret chain writes were `ascenTitle:` and
 * `ascenRankTitle:` before the app was called Summit. Renaming a localStorage
 * key is not like renaming a variable: the old value does not come with it, it
 * is simply orphaned — and what is orphaned here is the thing somebody clicked
 * ten times and followed a chain of clues to earn. So the read falls back to
 * the old name, and moving it across is what makes the fallback finite rather
 * than a branch this code carries for ever.
 *
 * Exported because utils/rankTitle.ts owns the second of the two keys and has
 * exactly the same problem; two copies of this would be two chances to get the
 * order of the arguments wrong.
 */
export function carriedOver(now: string, before: string): string | null {
  try {
    const held = localStorage.getItem(now);
    if (held !== null) return held;

    const old = localStorage.getItem(before);
    if (old === null) return null;
    localStorage.setItem(now, old);
    localStorage.removeItem(before);
    return old;
  } catch {
    return null;
  }
}
