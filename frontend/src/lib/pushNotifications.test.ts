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
      options: { applicationServerKey: null },
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

  it('re-subscribes when the browser VAPID public key no longer matches the server', async () => {
    const oldKey = new Uint8Array(65).fill(1);
    const unsubscribe = vi.fn().mockResolvedValue(undefined);
    const staleSubscription = {
      endpoint: 'https://push.example.test/device/stale',
      options: { applicationServerKey: oldKey.buffer },
      toJSON: () => ({
        endpoint: 'https://push.example.test/device/stale',
        keys: { p256dh: 'old', auth: 'old' },
      }),
      unsubscribe,
    };
    const freshSubscription = {
      endpoint: 'https://push.example.test/device/fresh',
      options: { applicationServerKey: null },
      toJSON: () => ({
        endpoint: 'https://push.example.test/device/fresh',
        keys: { p256dh: 'new', auth: 'new' },
      }),
      unsubscribe: vi.fn(),
    };
    const subscribe = vi.fn().mockResolvedValue(freshSubscription);
    const getSubscription = vi
      .fn()
      .mockResolvedValueOnce(staleSubscription)
      .mockResolvedValue(freshSubscription);

    Object.defineProperty(globalThis, 'Notification', {
      value: { permission: 'granted' },
      configurable: true,
    });

    vi.mocked(pushApi.getConfig).mockResolvedValue({
      enabled: true,
      public_key: 'BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    vi.mocked(pushApi.subscribe).mockResolvedValue(undefined);
    vi.mocked(pushApi.unsubscribe).mockResolvedValue(undefined);

    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription,
            subscribe,
          },
        }),
      },
    });

    const { ensurePushSubscription } = await import('./pushNotifications');
    const status = await ensurePushSubscription({ force: true });

    expect(status).toBe('subscribed');
    expect(pushApi.unsubscribe).toHaveBeenCalledWith('https://push.example.test/device/stale');
    expect(unsubscribe).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalled();
    expect(pushApi.subscribe).toHaveBeenCalledWith({
      endpoint: 'https://push.example.test/device/fresh',
      keys: { p256dh: 'new', auth: 'new' },
    });
  });
});
