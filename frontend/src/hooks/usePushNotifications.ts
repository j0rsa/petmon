import { useEffect, useRef } from 'react';
import { ensurePushSubscription } from '../lib/pushNotifications';

/** Request notification permission and register a push subscription once per session. */
export function usePushNotifications() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void ensurePushSubscription().catch((error) => {
      console.warn('Push notification setup failed', error);
    });
  }, []);
}
