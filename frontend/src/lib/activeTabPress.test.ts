import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleActiveTabPress, isAtScrollTop } from './activeTabPress';

function stubWindow(scrollY: number, scrollTo = vi.fn(), reload = vi.fn()) {
  vi.stubGlobal('window', { scrollY, scrollTo, location: { reload } });
  return { scrollTo, reload };
}

describe('isAtScrollTop', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true near the top of the page', () => {
    stubWindow(0);
    expect(isAtScrollTop()).toBe(true);

    stubWindow(2);
    expect(isAtScrollTop()).toBe(true);
  });

  it('returns false when scrolled down', () => {
    stubWindow(48);
    expect(isAtScrollTop()).toBe(false);
  });
});

describe('handleActiveTabPress', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scrolls to top when not at the top', () => {
    const { scrollTo, reload } = stubWindow(120);
    const preventDefault = vi.fn();

    handleActiveTabPress({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads when already at the top', () => {
    const { scrollTo, reload } = stubWindow(0);
    const preventDefault = vi.fn();

    handleActiveTabPress({ preventDefault });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
