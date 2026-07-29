import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import type { NotificationItem } from '../api/notifications';
import {
  useNotificationActions,
  useNotificationList,
  useNotificationUnreadCount,
} from '../hooks/useNotifications';
import { NotificationRow } from './NotificationRow';

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unreadQuery = useNotificationUnreadCount();
  const listQuery = useNotificationList(open);
  const { markAllReadMutation, openNotification } = useNotificationActions(() => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function handleOpen(item: NotificationItem) {
    openNotification(item);
  }

  const unreadCount = unreadQuery.data?.count ?? 0;
  const items = listQuery.data ?? [];
  const hasUnread = items.some((item) => !item.read);

  return (
    <div className="notification-center notification-center-desktop" ref={panelRef}>
      <button
        type="button"
        className="notification-bell"
        aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notification-bell-badge" aria-hidden="true">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <div className="notification-panel-header">
            <h3>Notifications</h3>
            {hasUnread && (
              <button
                type="button"
                className="notification-mark-all"
                disabled={markAllReadMutation.isPending}
                onClick={() => markAllReadMutation.mutate()}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="notification-panel-body">
            {listQuery.isLoading && <p className="notification-empty">Loading…</p>}
            {!listQuery.isLoading && items.length === 0 && (
              <p className="notification-empty">No notifications yet.</p>
            )}
            {items.map((item) => (
              <NotificationRow key={item.id} item={item} onOpen={handleOpen} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
