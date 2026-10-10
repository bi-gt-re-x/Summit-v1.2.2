/**
 * Mango, the tutorial's guide: a mango with googly eyes, little feet and one
 * arm it points with.
 *
 * `angle` is where the thing it's pointing at is, in degrees (0 is right, 90
 * is down). The arm swings round to it and the pupils slide toward it, on a
 * springy transition so they wobble like real googly eyes. With no angle it
 * folds the arm away and looks at the reader.
 *
 * `hop` changes every time Mango moves somewhere new. It keys the inner
 * element, which restarts the hop animation (crouch, jump, squash on landing)
 * while the outer element slides across the screen in styles/tutorial.css.
 */
import { useId } from 'react';

export interface MangoProps {
  angle: number | null;
  hop: string;
}

export function Mango({ angle, hop }: MangoProps) {
  const id = useId().replace(/:/g, '');
  const rad = angle === null ? Math.PI / 2 : (angle * Math.PI) / 180;
  const look = angle === null ? { x: 0, y: 1.5 } : { x: Math.cos(rad) * 4.2, y: Math.sin(rad) * 4.2 };
  const pupil = (cx: number, cy: number) => ({
    transform: `translate(${look.x}px, ${look.y}px)`,
    transformOrigin: `${cx}px ${cy}px`,
  });

  return (
    <div key={hop} className="tut-mango-hop">
      <svg className="tut-mango-svg" viewBox="0 0 100 110" aria-hidden="true">
        <defs>
          <radialGradient id={`${id}-skin`} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor="#ffe066" />
            <stop offset="45%" stopColor="#ffb52e" />
            <stop offset="80%" stopColor="#ff8a1f" />
            <stop offset="100%" stopColor="#f2602a" />
          </radialGradient>
        </defs>

        {/* The arm, behind the body so only the part outside it shows. */}
        <g
          className={`tut-mango-arm${angle === null ? ' is-down' : ''}`}
          style={{ transform: `rotate(${angle ?? 120}deg)`, transformOrigin: '50px 58px' }}
        >
          <path d="M50 58 H96" stroke="#e8801a" strokeWidth="4.5" strokeLinecap="round" />
          <circle cx="97" cy="58" r="5.5" fill="#ffb52e" stroke="#e8801a" strokeWidth="2" />
          <path d="M100 58 H106" stroke="#e8801a" strokeWidth="3.5" strokeLinecap="round" />
        </g>

        {/* Feet */}
        <ellipse cx="38" cy="101" rx="8" ry="4.5" fill="#e0701a" />
        <ellipse cx="62" cy="101" rx="8" ry="4.5" fill="#e0701a" />
        <path d="M38 92 V99 M62 92 V99" stroke="#e0701a" strokeWidth="3.5" strokeLinecap="round" />

        {/* Body */}
        <path
          d="M52 16 C78 15 92 38 90 61 C88 84 70 97 49 96 C27 95 11 80 13 57 C15 33 28 17 52 16 Z"
          fill={`url(#${id}-skin)`}
        />
        <ellipse cx="34" cy="34" rx="11" ry="7" fill="#fff" opacity=".35" transform="rotate(-30 34 34)" />

        {/* Stem and leaf */}
        <path d="M52 17 C52 11 54 7 57 4" stroke="#6b4423" strokeWidth="3.2" fill="none" strokeLinecap="round" />
        <path d="M56 6 C64 -2 79 0 84 6 C76 13 63 14 56 6 Z" fill="#3fa34d" />
        <path d="M57 6 C66 5 74 5 82 6" stroke="#2c7a37" strokeWidth="1.2" fill="none" strokeLinecap="round" />

        {/* Cheeks and smile */}
        <ellipse cx="29" cy="66" rx="6" ry="3.6" fill="#ff5d73" opacity=".45" />
        <ellipse cx="73" cy="64" rx="6" ry="3.6" fill="#ff5d73" opacity=".45" />
        <path d="M43 68 Q51 76 59 67" stroke="#3a2416" strokeWidth="2.6" fill="none" strokeLinecap="round" />

        {/* Googly eyes */}
        <circle cx="38" cy="50" r="12" fill="#fff" stroke="#2b2b2b" strokeWidth="1.6" />
        <circle cx="64" cy="48" r="12" fill="#fff" stroke="#2b2b2b" strokeWidth="1.6" />
        <g className="tut-mango-pupil" style={pupil(38, 50)}>
          <circle cx="38" cy="50" r="5.8" fill="#1d1d1d" />
          <circle cx="36" cy="48" r="1.7" fill="#fff" />
        </g>
        <g className="tut-mango-pupil" style={pupil(64, 48)}>
          <circle cx="64" cy="48" r="5.8" fill="#1d1d1d" />
          <circle cx="62" cy="46" r="1.7" fill="#fff" />
        </g>
      </svg>
    </div>
  );
}
