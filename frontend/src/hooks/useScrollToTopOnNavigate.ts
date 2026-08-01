import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Reset window scroll on route changes; skip hash URLs (deep-links scroll themselves). */
export function resetScrollUnlessHash(hash: string): void {
  if (hash) return;
  window.scrollTo(0, 0);
}

export function useScrollToTopOnNavigate(): void {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    resetScrollUnlessHash(hash);
  }, [pathname, hash]);
}
