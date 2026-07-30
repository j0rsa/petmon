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
});
