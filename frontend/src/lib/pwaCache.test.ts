import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPwaCaches, isPwaCacheSupported, refreshPwaApp, setPwaUpdateHandler } from './pwaCache';

describe('pwaCache', () => {
  const unregister = vi.fn().mockResolvedValue(true);
  const getRegistrations = vi.fn().mockResolvedValue([{ unregister }]);
  const deleteCache = vi.fn().mockResolvedValue(true);
  const keys = vi.fn().mockResolvedValue(['workbox-precache-v2', 'pages-cache']);

  beforeEach(() => {
    vi.stubGlobal('navigator', { serviceWorker: { getRegistrations } });
    vi.stubGlobal('caches', { keys, delete: deleteCache });
    vi.stubGlobal('location', { reload: vi.fn() });
    setPwaUpdateHandler(async () => {});
    unregister.mockClear();
    getRegistrations.mockClear();
    deleteCache.mockClear();
    keys.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports cache APIs as supported when present', () => {
    expect(isPwaCacheSupported()).toBe(true);
  });

  it('unregisters service workers and deletes cache storage', async () => {
    await clearPwaCaches();

    expect(getRegistrations).toHaveBeenCalledOnce();
    expect(unregister).toHaveBeenCalledOnce();
    expect(keys).toHaveBeenCalledOnce();
    expect(deleteCache).toHaveBeenCalledWith('workbox-precache-v2');
    expect(deleteCache).toHaveBeenCalledWith('pages-cache');
  });

  it('uses the registered update handler when refreshing', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    setPwaUpdateHandler(update);

    await refreshPwaApp();

    expect(update).toHaveBeenCalledWith(true);
  });

  it('falls back to location.reload when no update handler is set', async () => {
    vi.resetModules();
    const { refreshPwaApp: refreshWithoutHandler } = await import('./pwaCache');

    await refreshWithoutHandler();

    expect(location.reload).toHaveBeenCalledOnce();
  });
});
