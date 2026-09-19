/**
 * The bell's panel: the list, and the two ways out of it.
 *
 * ## Every row can be thrown away, and that is the point
 *
 * This replaced three counts derived on every render. A derived count cannot
 * be deleted — there is nothing to delete, and the next render brings it back
 * — so the bell was a thing that told you the same three facts until you fixed
 * them. The rows here are real, the ✕ removes one for good, and Clear all
 * removes the lot; the server keeps a tombstone under each so the situation
 * behind it cannot raise it a second time (backend/tracking/notify.py).
 *
 * After a Clear all the panel is empty and stays empty until something
 * genuinely new happens — tomorrow's overdue list, a badge, a goal's date
 * coming up. That is the behaviour the button promises and it is the whole
 * reason the delete had to be a server round trip rather than a filter.
 *
 * ## The unread mark, and what the badge counts
 *
 * A row that has arrived since the bell was last opened carries a bar in its
 * tone. That is what `unread` is for — the badge on the bell counts the whole
 * list instead, because "you have four notifications" should stop being true
 * by them being dealt with rather than by being looked at once.
 *
 * ## Clear all does not ask
 *
 * Nothing here is data the account made, and everything here will be raised
 * again when its situation is genuinely new. A confirm dialog in front of that
 * is how you teach somebody to stop clearing their notifications.
 */
import { Link } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import { CHANNEL_NAMES, TONE_NAMES, ago } from './tone';
import type { Notification } from '@/services/notifications';
import '@/styles/notifications.css';

interface RowProps {
  item: Notification;
  /** Closes the whole panel — following a link should not leave it open. */
  onFollow: () => void;
  onRemove: (id: string) => void;
}

function Row({ item, onFollow, onRemove }: RowProps) {
  return (
    <li className={`nf-row is-${item.tone}${item.read_at ? '' : ' is-new'}`}>
      <Link className="nf-body" to={item.link || '/dashboard'} onClick={onFollow}>
        <span className={`nf-dot is-${item.tone}`} aria-hidden="true" />
        <span className="nf-text">
          <strong>{item.title}</strong>
          {item.body && <em>{item.body}</em>}
          <small>
            {CHANNEL_NAMES[item.channel]} · {TONE_NAMES[item.tone]} ·{' '}
            {ago(item.created_at)}
          </small>
        </span>
      </Link>
      <button
        type="button"
        className="nf-drop"
        aria-label={`Delete “${item.title}”`}
        title="Delete"
        onClick={() => onRemove(item.id)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </li>
  );
}

export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const { items, remove, clear } = useNotifications();

  return (
    <div className="nf-panel">
      <div className="nf-head">
        <span>Notifications</span>
        {items.length > 0 && (
          <button type="button" className="nf-clear" onClick={() => void clear()}>
            Delete all
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="nf-empty">
          No notifications.
        </p>
      ) : (
        <ul className="nf-list">
          {items.map((item) => (
            <Row
              key={item.id}
              item={item}
              onFollow={onClose}
              onRemove={(id) => void remove(id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
