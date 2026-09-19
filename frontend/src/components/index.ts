/**
 * Shared components — the ones that belong to no single page.
 *
 * The folders beside this file group the pieces that belong to one feature
 * (Calendar, Goals, Growth, Analytics, Dashboard, Home) and are imported from
 * their own path — `@/components/Calendar` — so this list stays short.
 *
 * It is short now because it was a speculative UI kit and is not any more.
 * Button, Card, Modal, ProgressBar, Sidebar and the Charts folder were written
 * against a structure the app might grow into and never imported by anything;
 * they were deleted rather than left as a second way to build a card that
 * disagrees with the `.card` every real page already uses. Git history has
 * them if a page ever wants one back.
 */
export { AppBoundary, ErrorBoundary, RootBoundary } from './ErrorBoundary';
export { Ambient } from './Ambient';
export type { AmbientProps } from './Ambient';
/* The card every page opens with, and the mountains behind it. Here rather
   than under a page's folder because the point of it is that it is the same
   card on all of them — see components/Hero.tsx. */
export { PageHero } from './Hero';
export type { HeroTone, PageHeroProps } from './Hero';
export { Range } from './Range';
export type { RangeProps } from './Range';
export { Rail, STATS_CHANGED } from './Rail';
/* The bell's two faces. In this list rather than behind their own path
   because neither belongs to a page: the panel is drawn inside the top bar and
   the pop-ups float over whatever is open. See components/Notifications. */
export { NotificationPanel, Toasts } from './Notifications';
/* The search panel, for the same reason: it belongs to the top bar rather
   than to a page. Its index of the app's containers is utils/siteIndex. */
export { SearchPanel } from './Search';
export type { Hit, SearchPanelProps } from './Search';
export { Topbar } from './Topbar';
/* The confirm-your-e-mail strip. Beside the top bar in this list because it is
   chrome for the same reason the bar is: it belongs to the shell, not to any
   page, and App.tsx draws it in the same breath. See components/VerifyBanner. */
export { VerifyBanner } from './VerifyBanner';
export { ErrorState, Loading, NotBuilt } from './PageState';
export { RefreshButton } from './RefreshButton';
export type { RefreshButtonProps } from './RefreshButton';
export { SubjectPicker } from './SubjectPicker';
export type { SubjectPickerProps } from './SubjectPicker';
/* Every icon in the app, by name — Lucide's, in place of emoji. See
   components/Icon.tsx. */
export { Icon } from './Icon';
export type { IconName, IconProps } from './Icon';
