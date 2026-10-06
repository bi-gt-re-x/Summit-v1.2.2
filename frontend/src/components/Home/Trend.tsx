/**
 * The little green "▲ 8%" beside a statistic.
 *
 * The original wrote these as plain text and home-final.js took
 * them apart at runtime — splitting "▲ 8%" into an arrow that can slide and a
 * number that can count. There is no reason to build the markup and then parse
 * it back: the parts are the parts, so they are rendered as such.
 *
 * `.tr-num` is a span and deliberately not a <b>, because the count-up in
 * useReveals looks for `.lp-stat-v b` and several of these sit inside one. Two
 * counters writing the same text node would fight.
 *
 * useFinalMotion is what animates them; this only says what they are.
 */
export function Trend({
  value,
  suffix = '',
  arrow = '▲',
}: {
  /** The number that counts up from zero. */
  value: number;
  /** What follows it — "%", or nothing. */
  suffix?: string;
  arrow?: string;
}) {
  return (
    <i className="lp-trend up">
      <span className="tr-arrow">{arrow}</span>{' '}
      <span className="tr-num">{value}</span>
      {suffix}
    </i>
  );
}
