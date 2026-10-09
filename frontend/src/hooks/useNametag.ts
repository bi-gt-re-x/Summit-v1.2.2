/**
 * The nametag: who is signed in, as both the top bar and the rail's foot say it.
 *
 * The two used to say different things — the top bar a picture and the
 * account's name, the rail a grey silhouette and the level's band with no name
 * at all — so the same person read as two on one screen. Both read this now,
 * so they cannot drift: the same picture, the same name, and the same title in
 * front of it (utils/rankTitle).
 *
 * The title is a question about *this* account, so it waits for one — the
 * account comes from hooks/useChainAccount, the same answer the hidden chain
 * keys its title by. It also listens for a change of pick (`TITLE_CHANGED`,
 * from either nametag's chooser) and for `storage`, which is how a title
 * equipped in /engine in another tab reaches this one.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { useChainAccount } from '@/hooks/useChainAccount';
import { useSettings } from '@/hooks/useSettings';
import { useStats } from '@/hooks/useStats';
import { format } from '@/utils';
import { earnedTitle } from '@/utils/easterEgg';
import { rankFor } from '@/utils/rank';
import { AUTOMATIC, TITLE_CHANGED, chooseTitle, chosenTitle, titleShown, titlesFor } from '@/utils/rankTitle';

export interface Nametag {
  /** The name the account calls itself, or its username. */
  name: string;
  /** The account's picture. */
  avatar: string;
  /** What goes in front of the name; null until the level and the account are known. */
  title: string | null;
  /** The level's band — what Automatic wears when nothing has been earned. */
  rank: string | null;
  /** What Automatic resolves to right now. */
  automatic: string | null;
  /** Every title on offer, best first. */
  titles: string[];
  /** The pick, or AUTOMATIC. */
  chosen: string;
  choose: (title: string) => void;
}

export function useNametag(): Nametag {
  const { username, avatar } = useAuth();
  const { displayName } = useSettings();
  const { stats } = useStats();
  const account = useChainAccount();

  /* Bumped by anything that might have changed what storage holds, so the
     reads below run again. The reads themselves are cheap and synchronous. */
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((n) => n + 1);
    window.addEventListener(TITLE_CHANGED, bump);
    window.addEventListener('storage', bump);
    return () => {
      window.removeEventListener(TITLE_CHANGED, bump);
      window.removeEventListener('storage', bump);
    };
  }, []);

  const level = stats ? format.levelForTotalXp(stats.xp).level : null;

  const answer = useMemo(() => {
    void version;
    if (level === null || account === null) {
      return { title: null, rank: null, automatic: null, titles: [], chosen: AUTOMATIC };
    }
    const rank = rankFor(level);
    const earned = earnedTitle(account);
    return {
      title: titleShown(account, rank, level),
      rank,
      automatic: earned || rank,
      titles: titlesFor(level, earned),
      chosen: chosenTitle(account),
    };
  }, [level, account, version]);

  const choose = useCallback(
    (title: string) => {
      if (account !== null) chooseTitle(account, title);
    },
    [account],
  );

  return { name: displayName || username || '', avatar, ...answer, choose };
}
