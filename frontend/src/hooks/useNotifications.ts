import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { notificationsApi, notificationHref, type NotificationItem } from '../api/notifications';
import { useSelectedPet } from '../context/SelectedPetContext';

export const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;
export const UNREAD_COUNT_QUERY_KEY = ['notifications-unread-count'] as const;

export function useNotificationUnreadCount() {
  return useQuery({
    queryKey: UNREAD_COUNT_QUERY_KEY,
    queryFn: notificationsApi.unreadCount,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useNotificationList(enabled: boolean) {
  return useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: () => notificationsApi.list({ limit: 50 }),
    enabled,
    refetchOnWindowFocus: true,
  });
}

export function useNotificationActions(onAfterOpen?: () => void) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setSelectedPetId } = useSelectedPet();

  const markReadMutation = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: (data) => {
      queryClient.setQueryData(UNREAD_COUNT_QUERY_KEY, data);
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });

  function openNotification(item: NotificationItem) {
    if (item.pet_id) {
      setSelectedPetId(item.pet_id);
    }
    navigate(notificationHref(item));
    if (!item.read) {
      markReadMutation.mutate(item.id);
    }
    onAfterOpen?.();
  }

  return {
    markReadMutation,
    markAllReadMutation,
    openNotification,
  };
}
