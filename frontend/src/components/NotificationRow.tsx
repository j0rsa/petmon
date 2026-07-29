import type { NotificationItem } from '../api/notifications';
import { formatNotificationRelativeTime } from '../lib/notificationTime';

export function NotificationRow({
  item,
  onOpen,
  compact = false,
}: {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`notification-item${item.read ? '' : ' notification-item-unread'}${compact ? ' notification-item-compact' : ''}`}
      onClick={() => onOpen(item)}
    >
      <div className="notification-item-header">
        <span className="notification-item-title">{item.title}</span>
        {!item.read && <span className="notification-item-dot" aria-hidden="true" />}
      </div>
      {item.body && <p className="notification-item-body">{item.body}</p>}
      <span className="notification-item-time">{formatNotificationRelativeTime(item.created_at)}</span>
    </button>
  );
}
