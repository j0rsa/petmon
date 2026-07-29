import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { notificationsApi, notificationHref, type NotificationItem } from '../api/notifications';
import { useSelectedPet } from '../context/SelectedPetContext';

const NOTIFICATIONS_KEY = ['notifications'] as const;
const UNREAD_COUNT_KEY = ['notifications-unread-count'] as const;

function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function NotificationRow({
  item,
  onOpen,
}: {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
}) {
  return (
    <button
      type="button"
      className={`notification-item${item.read ? '' : ' notification-item-unread'}`}
      onClick={() => onOpen(item)}
    >
      <div className="notification-item-header">
        <span className="notification-item-title">{item.title}</span>
        {!item.read && <span className="notification-item-dot" aria-hidden="true" />}
      </div>
      {item.body && <p className="notification-item-body">{item.body}</p>}
      <span className="notification-item-time">{formatRelativeTime(item.created_at)}</span>
    </button>
  );
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setSelectedPetId } = useSelectedPet();

  const unreadQuery = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: notificationsApi.unreadCount,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const listQuery = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => notificationsApi.list({ limit: 50 }),
    enabled: open,
    refetchOnWindowFocus: true,
  });

  const markReadMutation = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: (data) => {
      queryClient.setQueryData(UNREAD_COUNT_KEY, data);
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });

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

  function openNotification(item: NotificationItem) {
    if (item.pet_id) {
      setSelectedPetId(item.pet_id);
    }
    navigate(notificationHref(item));
    if (!item.read) {
      markReadMutation.mutate(item.id);
    }
    setOpen(false);
  }

  const unreadCount = unreadQuery.data?.count ?? 0;
  const items = listQuery.data ?? [];
  const hasUnread = items.some((item) => !item.read);

  return (
    <div className="notification-center" ref={panelRef}>
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
              <NotificationRow key={item.id} item={item} onOpen={openNotification} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
