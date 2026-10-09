/**
 * Which title goes in front of your name.
 *
 * The nametag — the top bar's account button, and the plate at the foot of
 * the rail — reads "<title> <name>". By default the title is the band your
 * level has reached (Apprentice, Adept, Grand Champion), or the title the
 * hidden chain hands out once it has been earned. It is not the only true
 * thing it could say: a reader at level 34 has been every band below Master
 * on the way up, so the title can be chosen from all of them.
 *
 * **Only downwards.** The list is the bands *reached*, never the ones ahead —
 * a title is a thing you have been, and a chooser that offered Eternal at
 * level 2 would make every one of them worthless. Outgrow a chosen title and
 * it stays chosen, because it is still true.
 *
 * The one entry that is not a band is the title the hidden chain hands out at
 * the end (`earnedTitle`, in utils/easterEgg.ts).
 *
 * ## Equipping it at the end of the chain
 *
 * frontend/secret/hidden-engine.js writes *this file's* key alongside its own
 * when the ADMIN ROOM hands the title over (and again when SUMMIT CORE renames
 * it), so the reader walks back to a nametag that has changed even if they had
 * picked a band here before. Anything else makes a button that says TITLE
 * EQUIPPED and equips nothing. So `key()` below is a contract with that
 * script, in the way the keys in utils/easterEgg.ts are.
 *
 * "Automatic" wears the earned title when there is one and the band when
 * there is not, so an account that earned it before the room wrote this key
 * is wearing it too.
 *
 * ## Why localStorage and not a preference
 *
 * The secret title it can be set to is itself a localStorage fact written by a
 * script that never talks to the server, so putting the choice on the account
 * would let a device sync a title the account has no idea exists. The choice
 * lives where the thing being chosen lives.
 */
import { TIERS } from '@/utils/rank';
import { carriedOver, earnedTitle } from '@/utils/easterEgg';

/** Follow the level (or wear the earned title), which is what nothing chosen means. */
export const AUTOMATIC = '';

/**
 * Announced when the pick changes, so both nametags repaint together. The
 * same device as `summit:stats-changed`: one fact, one direction, no reply.
 */
export const TITLE_CHANGED = 'summit:title-changed';

function key(username: string): string {
  return `summitRankTitle:${username || 'Default'}`;
}

/** What this key was called while the app was called something else. */
function formerKey(username: string): string {
  return `ascenRankTitle:${username || 'Default'}`;
}

/** The title this account has picked, or AUTOMATIC. */
export function chosenTitle(username: string): string {
  return carriedOver(key(username), formerKey(username)) ?? AUTOMATIC;
}

/** Remember the pick, and tell both nametags. AUTOMATIC clears it. */
export function chooseTitle(username: string, title: string): void {
  try {
    if (title === AUTOMATIC) localStorage.removeItem(key(username));
    else localStorage.setItem(key(username), title);
  } catch {
    /* storage blocked: the pick is not kept past this render */
  }
  window.dispatchEvent(new CustomEvent(TITLE_CHANGED));
}

/**
 * Everything this account may call itself, best first: the earned title when
 * there is one, then the bands reached from the highest down.
 */
export function titlesFor(level: number, earned: string | null): string[] {
  const reached = TIERS.filter((tier) => level >= tier.from)
    .map((tier) => tier.name)
    .reverse();
  return earned ? [earned, ...reached.filter((name) => name !== earned)] : reached;
}

/**
 * What to print. A chosen title the account can no longer justify — the secret
 * one, cleared out of storage — falls back to what Automatic would say.
 */
export function titleShown(account: string, rank: string, level: number): string {
  const earned = earnedTitle(account);
  const chosen = chosenTitle(account);
  if (chosen && titlesFor(level, earned).includes(chosen)) return chosen;
  return earned || rank;
}
