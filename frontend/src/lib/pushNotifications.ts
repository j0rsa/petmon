import { pushApi } from '../api/push';

export type PushSupportStatus =
  | 'unsupported'
  | 'denied'
  | 'prompt'
  | 'granted-not-subscribed'
  | 'subscribed'
  | 'server-disabled';

/** Minimum gap between background re-syncs (focus/visibility). Subscriptions last weeks+. */
const RESYNC_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

let lastSyncAt = 0;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  // Explicit ArrayBuffer so PushManager.subscribe accepts the key under TS 5.7+.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** `null` when the browser does not expose the bound key — do not force-rotate. */
function applicationServerKeysMatch(
  subscription: PushSubscription,
  publicKey: string,
): boolean | null {
  const existing = subscription.options?.applicationServerKey;
  if (!existing) return null;
  const expected = urlBase64ToUint8Array(publicKey);
  const actual = new Uint8Array(existing);
  if (actual.length !== expected.length) return false;
  return actual.every((byte, i) => byte === expected[i]);
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function getPushSupportStatus(): Promise<PushSupportStatus> {
  if (!isPushSupported()) return 'unsupported';

  const permission = Notification.permission;
  if (permission === 'denied') return 'denied';
  if (permission === 'default') return 'prompt';

  const config = await pushApi.getConfig();
  if (!config.enabled || !config.public_key) return 'server-disabled';

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return 'granted-not-subscribed';
  return 'subscribed';
}

async function syncSubscription(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Invalid push subscription');
  }

  await pushApi.subscribe({
    endpoint: json.endpoint,
    keys: {
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
  });
}

async function getBrowserSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.ready;
    return registration.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** Remove this device's push subscription from the browser and server. */
export async function unsubscribePushNotifications(): Promise<void> {
  if (!isPushSupported()) return;

  const subscription = await getBrowserSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  try {
    await pushApi.unsubscribe(endpoint);
  } catch {
    // Best effort — token may already be cleared during sign-out.
  }

  try {
    await subscription.unsubscribe();
  } catch {
    // Browser may have already dropped the subscription.
  }
}

export async function ensurePushSubscription(options?: {
  force?: boolean;
}): Promise<PushSupportStatus> {
  if (!isPushSupported()) return 'unsupported';

  const now = Date.now();
  if (!options?.force && now - lastSyncAt < RESYNC_MIN_INTERVAL_MS) {
    return getPushSupportStatus();
  }
  lastSyncAt = now;

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    if (permission === 'denied') {
      await unsubscribePushNotifications();
    }
    return permission === 'denied' ? 'denied' : 'prompt';
  }

  const config = await pushApi.getConfig();
  if (!config.enabled || !config.public_key) return 'server-disabled';

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  // Re-subscribe when the server VAPID public key changed — browsers keep the
  // old applicationServerKey binding otherwise, and push auth fails.
  if (subscription && applicationServerKeysMatch(subscription, config.public_key) === false) {
    try {
      await pushApi.unsubscribe(subscription.endpoint);
    } catch {
      // Best effort — local unsubscribe is what matters for rebinding.
    }
    try {
      await subscription.unsubscribe();
    } catch {
      // Already gone.
    }
    subscription = null;
  }

  if (!subscription) {
    const keyBytes = urlBase64ToUint8Array(config.public_key);
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes,
    });
  }

  await syncSubscription(subscription);
  return 'subscribed';
}

export async function sendTestPushNotification(): Promise<{
  sent: number;
  failed: number;
  error?: string | null;
}> {
  const status = await ensurePushSubscription({ force: true });
  if (status === 'unsupported') {
    throw new Error('Push notifications are not supported in this browser.');
  }
  if (status === 'denied') {
    throw new Error('Notification permission is blocked. Enable it in your browser settings.');
  }
  if (status === 'server-disabled') {
    throw new Error('Push notifications are not configured on the server.');
  }

  const subscription = await getBrowserSubscription();
  if (!subscription?.endpoint) {
    throw new Error('This device has no push subscription. Allow notifications and try again.');
  }

  // ensurePushSubscription already synced keys; send only to this browser endpoint.
  return pushApi.sendTest(subscription.endpoint);
}

/** Watch for notification permission changes (e.g. user blocks in browser settings). */
export function watchNotificationPermission(
  onChange: (permission: NotificationPermission) => void,
): () => void {
  if (!isPushSupported() || !('permissions' in navigator)) {
    return () => {};
  }

  let disposed = false;
  let statusRef: PermissionStatus | null = null;

  void navigator.permissions
    .query({ name: 'notifications' as PermissionName })
    .then((status) => {
      if (disposed) return;
      statusRef = status;
      status.onchange = () => {
        onChange(Notification.permission);
      };
    })
    .catch(() => {});

  return () => {
    disposed = true;
    if (statusRef) {
      statusRef.onchange = null;
    }
  };
}
