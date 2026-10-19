/**
 * The first-week quest line: six first things, each worth some XP once.
 *
 * A new account lands on an Analytics page that needs days of data before it
 * can say much. This gives those days something to aim at: a short list of
 * real actions, each one ticked by the action itself (the server looks for the
 * row it leaves, backend/tracking/quests.py) and paid in XP on a tap. Every
 * quest links to the page where it's done, so the list is also a tour of the
 * app that pays.
 *
 * ## When it shows
 *
 * `showFirstWeek` below, and only then: the account is young, meaning fewer
 * than FIRST_WEEK_DAYS active days by `dataMaturity` (the count every other
 * "how new is this account" gate reads), something is still unclaimed, and
 * the Mango tour isn't running. The tour dims the page and points at real
 * buttons, so a new card arriving under it would only be in the way; it shows
 * up when the tour ends, which is when a new account asks "now what?".
 *
 * The server retires the line on its own for an account with XP on a week of
 * days, so a seasoned account never fetches its growth series to find out.
 *
 * ## Claiming
 *
 * The page owns the claim (pages/Dashboard.tsx) because a claim moves the XP
 * card and can level the account up, and both of those live there. This card
 * only says which quest was tapped and shows the result.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui';
import { growth as growthService, quests as questService } from '@/services';
import type { Quest, QuestClaim, QuestId, QuestLine } from '@/services/quests';
import { dataMaturity } from '@/utils/dataMaturity';
import { format } from '@/utils';

/** Active days past which the line hides. Also SEASONED_XP_DAYS in backend/tracking/quests.py. */
export const FIRST_WEEK_DAYS = 7;

export interface FirstWeekGate {
  line: QuestLine | null;
  /** Null until the growth series has been read. */
  activeDays: number | null;
  touring: boolean;
  /** Claimed the last one on this visit: keep the card up to say well done. */
  finishedHere: boolean;
}

export function showFirstWeek({ line, activeDays, touring, finishedHere }: FirstWeekGate): boolean {
  if (!line || touring) return false;
  if (finishedHere) return true;
  if (line.retired || line.quests.every((quest) => quest.claimed)) return false;
  return activeDays !== null && activeDays < FIRST_WEEK_DAYS;
}

/**
 * The quest line for one account, and how young it is.
 *
 * `bump` re-reads the quests (not the growth series) when it changes. The
 * page passes its task count, so finishing a first task right here ticks the
 * quest without a reload. Actions on other pages are seen when the reader
 * comes back, because the page mounts again.
 */
export function useFirstWeek(username: string | null | undefined, bump: unknown) {
  const [line, setLine] = useState<QuestLine | null>(null);
  const [activeDays, setActiveDays] = useState<number | null>(null);
  const [claimedHere, setClaimedHere] = useState(false);

  /* A failed read leaves the card hidden: it's a bonus, and the page under it
     has to work without it. */
  const read = useCallback(async () => {
    try {
      const result = await questService.list();
      if (!result.success) return null;
      setLine(result);
      return result;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!username) return;
    let live = true;
    void read().then((found) => {
      if (!live || !found || found.retired) return;
      // All of it (0), because a quiet old account would look young on a window.
      growthService.series(0).then(
        (series) => {
          if (live && series.success) setActiveDays(dataMaturity(series.growth_data).activeDays);
        },
        () => undefined,
      );
    });
    return () => {
      live = false;
    };
  }, [username, read]);

  // Later changes re-read the quests only. Skips the first run, which the
  // effect above already covers.
  const seen = useRef(bump);
  useEffect(() => {
    if (!username || Object.is(seen.current, bump)) return;
    seen.current = bump;
    void read();
  }, [bump, username, read]);

  /** Mark one claimed in place, as the server just did. */
  const markClaimed = useCallback((id: QuestId) => {
    setClaimedHere(true);
    setLine((current) => current && {
      ...current,
      quests: current.quests.map((quest) =>
        quest.id === id ? { ...quest, done: true, claimed: true } : quest,
      ),
    });
  }, []);

  const finishedHere = claimedHere && Boolean(line?.quests.every((quest) => quest.claimed));
  return { line, activeDays, finishedHere, markClaimed, reload: read };
}

export interface FirstWeekProps {
  quests: Quest[];
  /** The quest being claimed right now, if any. */
  busy: QuestId | null;
  /** The last claim that landed, for the little "+30 XP" pop. */
  lastClaim: QuestClaim | null;
  onClaim: (id: QuestId) => void;
}

function Check({ on }: { on: boolean }) {
  return (
    <span className={`fw-check${on ? ' is-on' : ''}`} aria-hidden="true">
      {on && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      )}
    </span>
  );
}

function QuestRow({ quest, busy, popped, onClaim }: {
  quest: Quest;
  busy: boolean;
  popped: boolean;
  onClaim: (id: QuestId) => void;
}) {
  const xp = `+${format.number(quest.xp)} XP`;
  const body = (
    <>
      <Check on={quest.done} />
      <span className="fw-text">
        <span className="fw-name">{quest.title}</span>
        <span className="fw-hint">{quest.claimed ? 'Done. Nice.' : quest.hint}</span>
      </span>
    </>
  );

  if (quest.claimed) {
    return (
      <li className="fw-quest is-claimed">
        {body}
        <span className="fw-xp is-paid">
          {xp}
          {popped && <span className="fw-pop" aria-hidden="true">{xp}</span>}
        </span>
      </li>
    );
  }

  if (quest.done) {
    return (
      <li className="fw-quest is-ready">
        {body}
        <button
          type="button"
          className="fw-claim"
          disabled={busy}
          onClick={() => onClaim(quest.id)}
          aria-label={`Claim ${xp} for ${quest.title.toLowerCase()}`}
        >
          {busy ? 'Claiming…' : `Claim ${xp}`}
        </button>
      </li>
    );
  }

  /* Not done yet: the whole row goes where it's done. "Come back tomorrow"
     has nowhere to go, so it just says when. */
  if (!quest.to) {
    return (
      <li className="fw-quest">
        {body}
        <span className="fw-xp">{xp}</span>
      </li>
    );
  }
  return (
    <li className="fw-quest">
      <Link className="fw-go" to={quest.to}>
        {body}
        <span className="fw-xp">{xp}</span>
      </Link>
    </li>
  );
}

export function FirstWeek({ quests, busy, lastClaim, onClaim }: FirstWeekProps) {
  const claimed = quests.filter((quest) => quest.claimed).length;
  const left = quests
    .filter((quest) => !quest.claimed)
    .reduce((sum, quest) => sum + quest.xp, 0);
  const all = claimed === quests.length;
  const percent = quests.length ? Math.round((claimed / quests.length) * 100) : 0;

  return (
    <Card className="dash-panel dash-quests" data-tour="first-week" aria-labelledby="fw-title">
      <div className="fw-head">
        <h2 className="dash-panel-title" id="fw-title">
          <span className="dash-stat-ico dash-ico-quest" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 21V4M5 4h11l-2 4 2 4H5" />
            </svg>
          </span>
          Your first week
        </h2>
        <span className="fw-count">
          {claimed} of {quests.length} done
          {!all && left > 0 && <span className="fw-left"> · {format.number(left)} XP to grab</span>}
        </span>
      </div>
      <p className="fw-lede">
        {all
          ? "That's all six. You've got the hang of it. Analytics fills in as you keep going."
          : "Quick wins to get you going. Each one pays XP, and they help Analytics learn your habits sooner."}
      </p>
      <span
        className="fw-track"
        role="progressbar"
        aria-label="First-week quests done"
        aria-valuemin={0}
        aria-valuemax={quests.length}
        aria-valuenow={claimed}
      >
        <i className="fw-fill" style={{ width: `${Math.max(2, percent)}%` }} />
      </span>
      <ul className="fw-list">
        {quests.map((quest) => (
          <QuestRow
            key={quest.id}
            quest={quest}
            busy={busy === quest.id}
            popped={lastClaim?.quest === quest.id}
            onClaim={onClaim}
          />
        ))}
      </ul>
    </Card>
  );
}
