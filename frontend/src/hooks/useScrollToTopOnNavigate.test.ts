import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetScrollUnlessHash } from './useScrollToTopOnNavigate';

describe('resetScrollUnlessHash', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('scrolls to the top when there is no hash', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('window', { scrollTo });

    resetScrollUnlessHash('');

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('does not scroll when a hash is present', () => {
    const scrollTo = vi.fn();
    vi.stubGlobal('window', { scrollTo });

    resetScrollUnlessHash('#record-42');

    expect(scrollTo).not.toHaveBeenCalled();
  });
});
