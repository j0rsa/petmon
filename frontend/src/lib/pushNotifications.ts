import { pushApi } from '../api/push';

export type PushSupportStatus =
  | 'unsupported'
  | 'denied'
  | 'prompt'
  | 'granted-not-subscribed'
  | 'subscribed'
  | 'server-disabled';

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
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

export async function ensurePushSubscription(): Promise<PushSupportStatus> {
  if (!isPushSupported()) return 'unsupported';

  let permission = Notification.permission;
  if (permission === 'default') {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    return permission === 'denied' ? 'denied' : 'prompt';
  }

  const config = await pushApi.getConfig();
  if (!config.enabled || !config.public_key) return 'server-disabled';

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

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

export async function sendTestPushNotification(): Promise<{ sent: number; failed: number }> {
  const status = await ensurePushSubscription();
  if (status === 'unsupported') {
    throw new Error('Push notifications are not supported in this browser.');
  }
  if (status === 'denied') {
    throw new Error('Notification permission is blocked. Enable it in your browser settings.');
  }
  if (status === 'server-disabled') {
    throw new Error('Push notifications are not configured on the server.');
  }

  return pushApi.sendTest();
}
