import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Applied to deep-link targets (e.g. elimination record rows) for the pop flash. */
export const DEEP_LINK_FLASH_CLASS = 'entry-row-wrap--deep-link-flash';

const FLASH_ANIMATION_NAME = 'entry-row-deep-link-pop';
const MAX_ATTEMPTS = 40;
const RETRY_MS = 100;

function cleanupFlash(el: Element) {
  el.classList.remove(DEEP_LINK_FLASH_CLASS);
}

/** Scroll to the element matching `location.hash` and play a one-shot highlight animation. */
export function useScrollToHash(...deps: unknown[]) {
  const { hash, pathname, search } = useLocation();
  const navigate = useNavigate();
  const highlightedRef = useRef<Element | null>(null);
  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    if (!hash || hash.length <= 1) return;

    const id = decodeURIComponent(hash.slice(1));
    let attempts = 0;
    let retryTimer: number | undefined;

    function onAnimationEnd(event: Event) {
      const anim = event as AnimationEvent;
      if (anim.animationName !== FLASH_ANIMATION_NAME) return;
      const el = event.currentTarget as Element;
      cleanupFlash(el);
      el.removeEventListener('animationend', onAnimationEnd);
      if (highlightedRef.current === el) {
        highlightedRef.current = null;
      }
    }

    function clearHashFromUrl() {
      navigate({ pathname, search, hash: '' }, { replace: true });
    }

    function flashElement(el: HTMLElement) {
      if (highlightedRef.current && highlightedRef.current !== el) {
        cleanupFlash(highlightedRef.current);
        highlightedRef.current.removeEventListener('animationend', onAnimationEnd);
      }

      el.scrollIntoView({ behavior: 'smooth', block: 'start' });

      el.classList.remove(DEEP_LINK_FLASH_CLASS);
      void el.offsetWidth;
      el.classList.add(DEEP_LINK_FLASH_CLASS);
      el.addEventListener('animationend', onAnimationEnd);
      highlightedRef.current = el;
      clearHashFromUrl();
    }

    function tryHighlight() {
      const el = document.getElementById(id);
      if (!el) {
        attempts += 1;
        if (attempts < MAX_ATTEMPTS) {
          retryTimer = window.setTimeout(tryHighlight, RETRY_MS);
        }
        return;
      }
      flashElement(el);
    }

    const initialTimer = window.setTimeout(tryHighlight, 50);

    return () => {
      window.clearTimeout(initialTimer);
      if (retryTimer) window.clearTimeout(retryTimer);
      if (highlightedRef.current) {
        highlightedRef.current.removeEventListener('animationend', onAnimationEnd);
        cleanupFlash(highlightedRef.current);
        highlightedRef.current = null;
      }
    };
  }, [hash, depsKey, navigate, pathname, search]);
}
