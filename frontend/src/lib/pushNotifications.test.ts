import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { pushApi } from '../api/push';

vi.mock('../api/push', () => ({
  pushApi: {
    getConfig: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    sendTest: vi.fn(),
  },
}));

describe('pushNotifications', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(pushApi.unsubscribe).mockResolvedValue(undefined);
    vi.stubGlobal('window', globalThis);
    Object.defineProperty(globalThis, 'PushManager', {
      value: function PushManager() {},
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Notification', {
      value: function Notification() {},
      configurable: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('unsubscribes from browser and server', async () => {
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const subscription = {
      endpoint: 'https://push.example.test/device/1',
      unsubscribe,
    };

    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(subscription),
          },
        }),
      },
    });

    const { unsubscribePushNotifications } = await import('./pushNotifications');
    await unsubscribePushNotifications();

    expect(pushApi.unsubscribe).toHaveBeenCalledWith('https://push.example.test/device/1');
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('sends a test push only to this device endpoint', async () => {
    const subscription = {
      endpoint: 'https://push.example.test/device/1',
      toJSON: () => ({
        endpoint: 'https://push.example.test/device/1',
        keys: { p256dh: 'p', auth: 'a' },
      }),
      unsubscribe: vi.fn(),
    };

    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'granted' },
      configurable: true,
    });

    vi.mocked(pushApi.getConfig).mockResolvedValue({
      enabled: true,
      public_key: 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    vi.mocked(pushApi.subscribe).mockResolvedValue(undefined);
    vi.mocked(pushApi.sendTest).mockResolvedValue({ sent: 1, failed: 0 });

    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(subscription),
            subscribe: vi.fn(),
          },
        }),
      },
    });

    const { sendTestPushNotification } = await import('./pushNotifications');
    const result = await sendTestPushNotification();

    expect(pushApi.sendTest).toHaveBeenCalledWith('https://push.example.test/device/1');
    expect(result).toEqual({ sent: 1, failed: 0 });
  });
});