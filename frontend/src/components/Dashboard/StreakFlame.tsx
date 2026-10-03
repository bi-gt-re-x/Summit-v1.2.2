/**
 * The streak's flame: a picture of how long the run is, and of the moment it grows.
 *
 * ## Size first, then heat
 *
 * A new run is a spark. It becomes a flame at 3 days and grows until 14, when
 * it is as large as the disc it sits in can hold. From there it cannot get
 * bigger, so it gets *hotter*: red, yellow, blue — the order a real flame
 * climbs through as it burns hotter — and at a year, the colour of a body at
 * infinite temperature, the faint violet-blue that the black-body locus
 * runs out at (CIE x≈0.240, y≈0.234, about #94B1FF in sRGB). Nothing can be
 * hotter than that, which is the point of putting it at the end.
 *
 * The thresholds are the milestones the bell already announces
 * (STREAK_MILESTONES in backend/tracking/notify.py), so the flame changes on
 * the days the app already calls special rather than on days of its own.
 *
 * The stages have no names. The flame is a picture of the streak, not a second
 * thing to track beside it, so the card says the streak and the flame shows it.
 *
 * ## The moment
 *
 * `flaring` is set by the card for the second after the streak goes up. The
 * flame bursts and settles, a few embers lift off it, and if the run has just
 * crossed a threshold the new size or colour is what it settles into — the
 * stage is drawn with CSS transitions, so the change is seen happening rather
 * than swapped. All of it is CSS, and all of it is switched off under reduced
 * motion, where the flame simply is its new stage.
 */

/** How the flame is drawn: its outline, then its colour. */
export type FlameSize = 'ember' | 'spark' | 'small' | 'medium' | 'large';
export type FlameHeat = 'cold' | 'flame' | 'red' | 'yellow' | 'blue' | 'infinite';

export interface FlameStage {
  /** From the smallest to the hottest. Also the CSS hook: `flame-${key}`. */
  key: 'none' | 'spark' | 'small' | 'medium' | 'full' | 'red' | 'yellow' | 'blue' | 'infinite';
  /** The streak length this stage starts at. */
  from: number;
  size: FlameSize;
  heat: FlameHeat;
}

/** Every stage, in order. Each lasts until the next one's `from`. */
export const FLAME_STAGES: readonly FlameStage[] = [
  { key: 'none', from: 0, size: 'ember', heat: 'cold' },
  { key: 'spark', from: 1, size: 'spark', heat: 'flame' },
  { key: 'small', from: 3, size: 'small', heat: 'flame' },
  { key: 'medium', from: 7, size: 'medium', heat: 'flame' },
  { key: 'full', from: 14, size: 'large', heat: 'flame' },
  { key: 'red', from: 30, size: 'large', heat: 'red' },
  { key: 'yellow', from: 50, size: 'large', heat: 'yellow' },
  { key: 'blue', from: 100, size: 'large', heat: 'blue' },
  { key: 'infinite', from: 365, size: 'large', heat: 'infinite' },
];

export function flameStage(streak: number): FlameStage {
  let stage = FLAME_STAGES[0]!;
  for (const candidate of FLAME_STAGES) if (streak >= candidate.from) stage = candidate;
  return stage;
}

/** The shape alone. Coloured by the chip it sits in (`currentColor`). */
export function StreakFlame({ streak, flaring }: { streak: number; flaring: boolean }) {
  const stage = flameStage(streak);
  return (
    <span
      className={`flame flame-size-${stage.size} flame-heat-${stage.heat}${flaring ? ' is-flaring' : ''}`}
      aria-hidden="true"
    >
      <svg className="flame-svg" width="24" height="24" viewBox="0 0 24 24">
        {/* The spark: a four-pointed glint. Drawn underneath the flame and
            faded in or out with the stage, so a run going from 2 to 3 days is
            seen catching rather than being replaced by a different picture. */}
        <path
          className="flame-spark"
          d="M12 6.5c.5 3 1.5 4 4.5 4.5-3 .5-4 1.5-4.5 4.5-.5-3-1.5-4-4.5-4.5 3-.5 4-1.5 4.5-4.5z"
          fill="currentColor"
        />
        <g className="flame-body">
          <path
            className="flame-outer"
            d="M12 2.5c.6 2.9 2.3 4.6 4 6.3 1.9 1.9 3.2 3.9 3.2 6.4A7.2 7.2 0 0 1 12 22.4a7.2 7.2 0 0 1-7.2-7.2c0-2 .8-3.7 2-5.2.3 1.6 1.2 2.8 2.4 3.3-.4-3.6.8-7.2 2.8-10.8z"
            fill="currentColor"
          />
          {/* The core, paler than the flame around it — which is also what
              makes the hot colours read as heat rather than as paint. */}
          <path
            className="flame-core"
            d="M12 12.2c.4 1.4 1.3 2.3 2.1 3.1.8.8 1.3 1.6 1.3 2.6a3.4 3.4 0 0 1-6.8 0c0-1.6.9-2.9 1.9-3.7.1.7.4 1.2.9 1.5-.1-1.2.1-2.4.6-3.5z"
            fill="#fff"
          />
        </g>
      </svg>
      {flaring && (
        <span className="flame-embers">
          <i />
          <i />
          <i />
        </span>
      )}
    </span>
  );
}
