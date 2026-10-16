/**
 * Notifications, on the screen rather than behind a bell.
 *
 * ## Shown once, and then only in the bell
 *
 * A pop-up appears for a notification the account has not been shown yet, and
 * the provider stamps it the moment this draws it — so it appears once, on the
 * screen it arrived on, and after that it lives in the panel like everything
 * else. Closing one is a thing that happens to the pop-up: the notification is
 * still in the bell afterwards, which is why the ✕ here says "close" and the ✕
 * in the panel says "delete".
 *
 * ## Three at a time, and it leaves on its own
 *
 * A stack that can cover the page is a stack people learn to dismiss without
 * reading. Three is enough to notice a busy morning and few enough to see the
 * app underneath; the rest wait in the bell, where the badge says how many.
 *
 * Each one leaves after `LIFE_MS` unless the pointer is on it — a reader in
 * the middle of the sentence should not have it taken away — and the whole
 * stack sits outside the click-outside handling in components/Topbar.tsx,
 * because a pop-up over the page is not part of any panel.
 *
 * ## It is off when the account says so
 *
 * `notify_popups` in Settings takes this away and leaves the bell working,
 * which is the half of a notification system people actually want to turn off.
 * The provider applies it, so nothing here has to know.
 */
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import { CHANNEL_NAMES, TONE_NAMES } from './tone';
import type { Notification } from '@/services/notifications';
import '@/styles/notifications.css';

/** How long one stays up. Long enough to read two lines twice. */
const LIFE_MS = 9_000;

/** How many are on screen at once. The rest are in the bell. */
const AT_ONCE = 3;

function Toast({
  item,
  onClose,
}: {
  item: Notification;
  onClose: () => void;
}) {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    if (held) return;
    const timer = window.setTimeout(onClose, LIFE_MS);
    return () => window.clearTimeout(timer);
  }, [held, onClose]);

  return (
    <div
      className={`nf-toast is-${item.tone}`}
      role="status"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
    >
      <span className={`nf-dot is-${item.tone}`} aria-hidden="true" />
      <div className="nf-toast-text">
        <small>
          {CHANNEL_NAMES[item.channel]} · {TONE_NAMES[item.tone]}
        </small>
        <strong>{item.title}</strong>
        {item.body && <p>{item.body}</p>}
        <Link className="nf-toast-go" to={item.link || '/dashboard'} onClick={onClose}>
          Open
        </Link>
      </div>
      <button
        type="button"
        className="nf-toast-close"
        aria-label="Close this pop-up"
        title="Close. It stays in your notifications."
        onClick={onClose}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}

export function Toasts() {
  const { popups, dismissPopup } = useNotifications();
  if (!popups.length) return null;

  return (
    <div className="nf-toasts" aria-live="polite">
      {popups.slice(0, AT_ONCE).map((item) => (
        <Toast key={item.id} item={item} onClose={() => dismissPopup(item.id)} />
      ))}
    </div>
  );
}
