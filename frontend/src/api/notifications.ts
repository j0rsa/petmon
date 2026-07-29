import { api } from './client';

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link_path: string;
  link_hash: string | null;
  pet_id: string | null;
  pet_name: string | null;
  created_at: string;
  read: boolean;
}

export interface NotificationUnreadCount {
  count: number;
}

export function notificationHref(item: NotificationItem): string {
  return item.link_hash ? `${item.link_path}#${item.link_hash}` : item.link_path;
}

export const notificationsApi = {
  list: (params?: { limit?: number; unread_only?: boolean }) => {
    const search = new URLSearchParams();
    if (params?.limit != null) search.set('limit', String(params.limit));
    if (params?.unread_only) search.set('unread_only', 'true');
    const query = search.toString();
    return api.get<NotificationItem[]>(`/notifications${query ? `?${query}` : ''}`);
  },
  unreadCount: () => api.get<NotificationUnreadCount>('/notifications/unread-count'),
  markRead: (id: string) => api.post<void>(`/notifications/${id}/read`, {}),
  markAllRead: () => api.post<NotificationUnreadCount>('/notifications/read-all', {}),
};
