import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Scroll to the element matching `location.hash` after mount or when deps change. */
export function useScrollToHash(...deps: unknown[]) {
  const { hash } = useLocation();

  useEffect(() => {
    if (!hash || hash.length <= 1) return;
    const id = decodeURIComponent(hash.slice(1));
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [hash, ...deps]);
}
