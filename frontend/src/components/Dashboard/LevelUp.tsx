/**
 * The level-up celebration — the port of `showLevelUpFx` in tasks.js.
 *
 * A "LEVEL UP!" badge bursts in mid-screen with sparks flying outward. Every
 * 5th level is a milestone: a bigger golden badge with a crown, more sparks
 * thrown further, and the bottom-corner confetti cannons join in.
 *
 * The sparks' angle and distance are per-spark custom properties (`--a`,
 * `--d`) that styles/dashboard.css reads — the same contract the original set
 * up, so the animation is the stylesheet's and only the numbers are here.
 *
 * It removes itself. The original set a timeout to drop the node; this unmounts
 * through the same timer, and clears it on unmount so navigating away mid-burst
 * does not leave one pending.
 */
import { useEffect, useMemo } from 'react';
import { Icon } from '@/components/Icon';

/** How long the badge stays up, in ms. */
const SHOW_MS = 1800;
const MILESTONE_SHOW_MS = 2600;

export interface LevelUpProps {
  level: number;
  onDone: () => void;
}

export function LevelUp({ level, onDone }: LevelUpProps) {
  const milestone = level % 5 === 0;

  // Rolled once per burst: re-rolling them on a re-render would make the
  // sparks jump mid-flight.
  const sparks = useMemo(() => {
    const count = milestone ? 20 : 10;
    return Array.from({ length: count }, (_, i) => ({
      angle: Math.round((360 / count) * i + Math.random() * 18),
      distance: Math.round(70 + Math.random() * (milestone ? 170 : 90)),
      delay: Number((Math.random() * 0.15).toFixed(2)),
    }));
  }, [milestone]);

  useEffect(() => {
    const timer = setTimeout(onDone, milestone ? MILESTONE_SHOW_MS : SHOW_MS);
    return () => clearTimeout(timer);
  }, [milestone, onDone]);

  return (
    <div
      className={`levelup-overlay${milestone ? ' milestone' : ''}`}
      aria-hidden="true"
    >
      <div className="levelup-badge">
        {milestone && <div className="levelup-crown"><Icon name="crown" /></div>}
        <div className="levelup-title">
          {milestone ? 'MILESTONE!' : 'LEVEL UP!'}
        </div>
        <div className="levelup-level">Level {level}</div>
      </div>
      {sparks.map((spark, i) => (
        <span
          key={i}
          className="levelup-spark"
          style={
            {
              '--a': `${spark.angle}deg`,
              '--d': `${spark.distance}px`,
              animationDelay: `${spark.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
