/**
 * The XP card beside "Reading this through" on Recommendations.
 *
 * The total for the window the picker chose, then the last 30 days against the
 * 30 before them, then a bar for each of the last 60 days. The bars cover a
 * fixed 60 days whatever the window is, so the card always answers "how have
 * the last two months gone" and the trend beside it is read off the same days
 * the bars draw.
 */
import { shortDate } from '@/utils/followup';
import type { GrowthDay } from '@/types/models';

const BARS = 60;
const HALF = 30;

const sum = (days: GrowthDay[]) => days.reduce((total, day) => total + (day.xp_earned || 0), 0);

export function XpPulse({ all, current }: { all: GrowthDay[]; current: GrowthDay[] }) {
  if (all.length === 0) return null;

  const total = sum(current);
  const recent = all.slice(-BARS);
  const now = sum(all.slice(-HALF));
  const before = all.length >= BARS ? sum(all.slice(-BARS, -HALF)) : null;
  const change = before ? Math.round(((now - before) / before) * 100) : null;
  const peak = Math.max(...recent.map((day) => day.xp_earned || 0), 1);
  const middle = recent[Math.floor(recent.length / 2)];

  return (
    <article className="ax-pulse">
      <p className="ax-pulse-label">Total XP earned</p>
      <div className="ax-pulse-figure">
        <strong>{total.toLocaleString('en-US')}</strong>
        {change !== null && (
          <span className={`ax-pulse-change ${change >= 0 ? 'is-up' : 'is-down'}`}>
            <b>
              {change >= 0 ? '↑' : '↓'} {Math.abs(change)}%
            </b>
            <span>vs. the 30 days before</span>
          </span>
        )}
      </div>
      <div
        className="ax-pulse-bars"
        role="img"
        aria-label={`XP a day over the last ${recent.length} days. ${now.toLocaleString('en-US')} XP in the last 30.`}
      >
        {recent.map((day) => (
          <i
            key={day.date}
            style={{ height: `${Math.max(4, Math.round(((day.xp_earned || 0) / peak) * 100))}%` }}
            className={day.xp_earned ? undefined : 'is-empty'}
          />
        ))}
      </div>
      <div className="ax-pulse-dates" aria-hidden="true">
        <span>{shortDate(recent[0]!.date)}</span>
        {middle && <span>{shortDate(middle.date)}</span>}
        <span>{shortDate(recent[recent.length - 1]!.date)}</span>
      </div>
    </article>
  );
}
