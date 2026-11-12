/**
 * Shared components — the app's shell, which belongs to no single page: the
 * rail, the top bar and its bell, the confirm-your-e-mail strip, the
 * background, and the loading and error states every page uses. The AMC pages'
 * own pieces are in components/Amc and are imported from there.
 */
export { AppBoundary, CardBoundary, ErrorBoundary, RootBoundary } from './ErrorBoundary';
export { Ambient } from './Ambient';
export { Rail, STATS_CHANGED } from './Rail';
/* The bell's two faces: the panel inside the top bar and the pop-ups over the
   page. See components/Notifications. */
export { NotificationPanel, Toasts } from './Notifications';
export { Topbar } from './Topbar';
/* Chrome for the same reason the bar is: one strip for the app, drawn by
   App.tsx. See components/VerifyBanner. */
export { VerifyBanner } from './VerifyBanner';
export { ErrorState, Loading, NotBuilt } from './PageState';
