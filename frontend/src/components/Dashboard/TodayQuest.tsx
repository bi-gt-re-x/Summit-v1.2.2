/**
 * Today's quest: one small thing a day for a young account, worth some XP.
 *
 * The first-week card (./FirstWeek) is mostly cleared in a day or two, which
 * left days three to ten with no clear reason to come back while Analytics
 * waits on active days. This fills that gap: the server picks one real action
 * a day (backend/tracking/quests.py, the same per account all day, and one
 * the account hasn't done lately), ticks it off the rows the action left
 * today, and pays it once a day.
 *
 * Under the quest sits the next Analytics stage and how many active days it
 * still needs (STAGE_FLOOR / STAGE_BRINGS in utils/dataMaturity, with the same
 * head start Analytics counts), so doing the quest is seen to move it along.
 *
 * ## When it shows
 *
 * `showTodayQuest`: the server sent one, the first-week card isn't up (all
 * claimed, retired, or the account is past it), the account has fewer than
 * DAILY_DAYS active days, and the Mango tour isn't running. A claim made on
 * this visit keeps it up even if that claim tipped the count over.
 *
 * The page owns the claim (pages/Dashboard.tsx), as it does for FirstWeek.
 */
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui';
import type { DailyQuest, QuestLine } from '@/services/quests';
import { STAGE_BRINGS, STAGE_FLOOR } from '@/utils/dataMaturity';
import type { Maturity } from '@/utils/dataMaturity';
import { format } from '@/utils';
import { Check } from './FirstWeek';

/** Active days past which there's no daily quest: when Performance opens.
 *  Also DAILY_XP_DAYS in backend/tracking/quests.py. */
export const DAILY_DAYS = STAGE_FLOOR.developing;

export interface TodayQuestGate {
  line: QuestLine | null;
  /** Null until the growth series has been read. */
  activeDays: number | null;
  touring: boolean;
  /** The first-week card is on the page. */
  firstWeekShowing: boolean;
  /** Claimed today's on this visit. */
  dailyHere: boolean;
}

export function showTodayQuest({
  line, activeDays, touring, firstWeekShowing, dailyHere,
}: TodayQuestGate): boolean {
  if (!line?.daily || touring || firstWeekShowing) return false;
  if (dailyHere) return true;
  return activeDays !== null && activeDays < DAILY_DAYS;
}

/** "3 more active days and Analytics opens Trends." Null with nothing ahead. */
export function stageCountdown(maturity: Maturity | null): string | null {
  if (!maturity?.next || !maturity.toNext) return null;
  const days = maturity.toNext === 1 ? '1 more active day' : `${maturity.toNext} more active days`;
  return `${days} and Analytics opens ${STAGE_BRINGS[maturity.next]}.`;
}

export interface TodayQuestProps {
  quest: DailyQuest;
  maturity: Maturity | null;
  /** Today already has work on it, so it's counted. */
  todayActive: boolean;
  busy: boolean;
  /** Just claimed here, for the little "+30 XP" pop. */
  popped: boolean;
  onClaim: () => void;
}

export function TodayQuest({ quest, maturity, todayActive, busy, popped, onClaim }: TodayQuestProps) {
  const xp = `+${format.number(quest.xp)} XP`;
  const countdown = stageCountdown(maturity);
  const body = (
    <>
      <Check on={quest.done} />
      <span className="fw-text">
        <span className="fw-name">{quest.title}</span>
        <span className="fw-hint">{quest.claimed ? 'Done. See you tomorrow.' : quest.hint}</span>
      </span>
    </>
  );

  let row;
  if (quest.claimed) {
    row = (
      <li className="fw-quest is-claimed">
        {body}
        <span className="fw-xp is-paid">
          {xp}
          {popped && <span className="fw-pop" aria-hidden="true">{xp}</span>}
        </span>
      </li>
    );
  } else if (quest.done) {
    row = (
      <li className="fw-quest is-ready">
        {body}
        <button
          type="button"
          className="fw-claim"
          disabled={busy}
          onClick={onClaim}
          aria-label={`Claim ${xp} for today's quest`}
        >
          {busy ? 'Claiming…' : `Claim ${xp}`}
        </button>
      </li>
    );
  } else if (quest.to) {
    row = (
      <li className="fw-quest">
        <Link className="fw-go" to={quest.to}>
          {body}
          <span className="fw-xp">{xp}</span>
        </Link>
      </li>
    );
  } else {
    row = (
      <li className="fw-quest">
        {body}
        <span className="fw-xp">{xp}</span>
      </li>
    );
  }

  /* Whether this quest is what makes today count. Claiming pays XP today,
     and any XP makes a day active (utils/activeDay). */
  const counts = todayActive ? 'Today already counts.' : quest.claimed ? null : 'This quest makes today count.';

  return (
    <Card className="dash-panel dash-quests tq-card" data-tour="today-quest" aria-labelledby="tq-title">
      <div className="fw-head">
        <h2 className="dash-panel-title" id="tq-title">
          <span className="dash-stat-ico dash-ico-quest" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <circle cx="12" cy="12" r="5" />
              <circle cx="12" cy="12" r="1.2" fill="currentColor" />
            </svg>
          </span>
          Today's quest
        </h2>
        <span className="fw-count">{quest.claimed ? 'Done for today' : 'New one every day'}</span>
      </div>
      <ul className="fw-list tq-list">{row}</ul>
      {countdown && maturity && (
        <div className="tq-stage">
          <span
            className="fw-track tq-track"
            role="progressbar"
            aria-label="Progress to the next Analytics stage"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(maturity.progress * 100)}
          >
            <i className="fw-fill" style={{ width: `${Math.max(2, Math.round(maturity.progress * 100))}%` }} />
          </span>
          <p className="tq-countdown">
            <strong>{countdown}</strong>
            {counts && <> {counts}</>}
          </p>
        </div>
      )}
    </Card>
  );
}
