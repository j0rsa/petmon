import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('virtual:pwa-register', () => ({
  registerSW: vi.fn(),
}));

const infoGet = vi.fn();

vi.mock('../api/info', () => ({
  infoApi: { get: () => infoGet() },
}));

vi.mock('./pwaCache', () => ({
  clearPwaCachesAndReload: vi.fn().mockResolvedValue(undefined),
}));

describe('checkServerVersionMismatch', () => {
  const reload = vi.fn();
  const removeItem = vi.fn();
  const getItem = vi.fn();
  const setItem = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    infoGet.mockReset();
    reload.mockReset();
    removeItem.mockReset();
    getItem.mockReset();
    setItem.mockReset();
    vi.stubGlobal('location', { reload });
    vi.stubGlobal('sessionStorage', { getItem, setItem, removeItem });
    vi.stubGlobal('__PETMON_BUILD__', { version: '0.16.1', gitSha: 'abc1234' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('clears reload guard when server matches embedded build', async () => {
    infoGet.mockResolvedValue({ version: '0.16.1', git_sha: 'abc1234' });
    const { checkServerVersionMismatch } = await import('./pwaUpdate');

    await checkServerVersionMismatch();

    expect(removeItem).toHaveBeenCalledWith('petmon-version-reload-attempted');
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads once when server reports a newer version', async () => {
    infoGet.mockResolvedValue({ version: '0.16.0', git_sha: 'def5678' });
    getItem.mockReturnValue(null);
    const { checkServerVersionMismatch } = await import('./pwaUpdate');

    await checkServerVersionMismatch();

    expect(setItem).toHaveBeenCalledWith('petmon-version-reload-attempted', '1');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('clears caches when reload did not fix a version mismatch', async () => {
    infoGet.mockResolvedValue({ version: '0.16.0', git_sha: 'def5678' });
    getItem.mockReturnValue('1');
    const { clearPwaCachesAndReload } = await import('./pwaCache');
    const { checkServerVersionMismatch } = await import('./pwaUpdate');

    await checkServerVersionMismatch();

    expect(clearPwaCachesAndReload).toHaveBeenCalledOnce();
    expect(reload).not.toHaveBeenCalled();
  });
});
