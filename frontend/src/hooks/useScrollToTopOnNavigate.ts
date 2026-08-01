import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Reset window scroll on pathname changes; skip hash URLs (deep-links scroll themselves). */
export function resetScrollUnlessHash(hash: string): void {
  if (hash) return;
  window.scrollTo(0, 0);
}

export function useScrollToTopOnNavigate(): void {
  const { pathname, hash } = useLocation();

  // Only react to pathname changes — not hash changes. Deep-link cleanup clears the
  // hash after the highlight animation; re-running on hash would scroll back to top.
  useEffect(() => {
    resetScrollUnlessHash(hash);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hash read at navigation time only
  }, [pathname]);
}
