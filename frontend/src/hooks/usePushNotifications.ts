import { useEffect } from 'react';
import {
  ensurePushSubscription,
  unsubscribePushNotifications,
  watchNotificationPermission,
} from '../lib/pushNotifications';

/** Keep push subscription in sync when the app loads or regains focus. */
export function usePushNotifications() {
  useEffect(() => {
    let cancelled = false;

    const sync = (force = false) => {
      if (cancelled) return;
      void ensurePushSubscription(force ? { force: true } : undefined).catch((error) => {
        console.warn('Push notification setup failed', error);
      });
    };

    sync(true);

    const onFocus = () => sync();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        sync();
      }
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    const stopPermissionWatch = watchNotificationPermission((permission) => {
      if (permission === 'denied') {
        void unsubscribePushNotifications().catch((error) => {
          console.warn('Push unsubscribe failed after permission change', error);
        });
        return;
      }
      if (permission === 'granted') {
        sync(true);
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      stopPermissionWatch();
    };
  }, []);
}
