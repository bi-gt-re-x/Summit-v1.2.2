/**
 * The app's icons, by name.
 *
 * Emoji used to stand in for icons across the app — a 🔥 beside a streak, a 🏆
 * over a record, a 📊 on a heading. They drew differently on every operating
 * system, picked up the platform's colours rather than the page's, and read as
 * a chat message rather than an interface. These are Lucide's line icons, which
 * take `currentColor` and sit on the text baseline like the hand-drawn glyphs
 * already in components/Growth.
 *
 * Keyed by a plain name rather than imported per use so that data — a record's
 * story, a landing-page feature row — can name its icon as a string.
 */
import {
  CalendarDays,
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  ClipboardList,
  Clock,
  Crown,
  Database,
  FolderOpen,
  Flame,
  Gem,
  Lightbulb,
  Link,
  ListChecks,
  Mail,
  Medal,
  Monitor,
  Pause,
  Pin,
  Play,
  Quote,
  ScrollText,
  Search,
  Shield,
  Sparkles,
  Sprout,
  Star,
  Sun,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

const ICONS = {
  calendar: CalendarDays,
  chart: ChartColumn,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  check: CircleCheck,
  clipboard: ClipboardList,
  clock: Clock,
  crown: Crown,
  database: Database,
  folder: FolderOpen,
  flame: Flame,
  gem: Gem,
  lightbulb: Lightbulb,
  link: Link,
  checklist: ListChecks,
  mail: Mail,
  medal: Medal,
  monitor: Monitor,
  pause: Pause,
  pin: Pin,
  play: Play,
  quote: Quote,
  scroll: ScrollText,
  search: Search,
  shield: Shield,
  sparkles: Sparkles,
  sprout: Sprout,
  star: Star,
  sun: Sun,
  target: Target,
  timer: Timer,
  trend: TrendingUp,
  trophy: Trophy,
  wrench: Wrench,
  zap: Zap,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export interface IconProps {
  name: IconName;
  /** Pixels, or `'1em'` to size with the surrounding text. */
  size?: number | string;
  className?: string;
}

export function Icon({ name, size = '1em', className }: IconProps) {
  const Glyph = ICONS[name];
  return (
    <Glyph
      className={className ? `icon ${className}` : 'icon'}
      size={size}
      strokeWidth={2}
      aria-hidden="true"
      focusable="false"
    />
  );
}
