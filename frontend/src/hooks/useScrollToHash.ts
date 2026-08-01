import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Applied to deep-link targets (e.g. elimination record rows) for the pop flash. */
export const DEEP_LINK_FLASH_CLASS = 'entry-row-wrap--deep-link-flash';

const FLASH_ANIMATION_NAME = 'entry-row-deep-link-pop';
const MAX_ATTEMPTS = 40;
const RETRY_MS = 100;
/** Fallback when scrollend is unavailable or scroll distance is zero. */
const FLASH_AFTER_SCROLL_MS = 500;

function applyFlash(el: HTMLElement, onAnimationEnd: (event: Event) => void) {
  el.classList.remove(DEEP_LINK_FLASH_CLASS);
  void el.offsetWidth;
  el.classList.add(DEEP_LINK_FLASH_CLASS);
  el.addEventListener('animationend', onAnimationEnd);
}

function flashAfterScroll(
  el: HTMLElement,
  onAnimationEnd: (event: Event) => void,
  onFlashStart: () => void,
) {
  let started = false;

  function startFlash() {
    if (started) return;
    started = true;
    onFlashStart();
    applyFlash(el, onAnimationEnd);
  }

  const fallbackTimer = window.setTimeout(startFlash, FLASH_AFTER_SCROLL_MS);

  function onScrollEnd() {
    window.clearTimeout(fallbackTimer);
    window.removeEventListener('scrollend', onScrollEnd);
    startFlash();
  }

  if ('onscrollend' in window) {
    window.addEventListener('scrollend', onScrollEnd, { once: true });
  }
}

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

    function clearHashFromUrl() {
      navigate({ pathname, search, hash: '' }, { replace: true });
    }

    function onAnimationEnd(event: Event) {
      const anim = event as AnimationEvent;
      if (anim.animationName !== FLASH_ANIMATION_NAME) return;
      const el = event.currentTarget as Element;
      cleanupFlash(el);
      el.removeEventListener('animationend', onAnimationEnd);
      if (highlightedRef.current === el) {
        highlightedRef.current = null;
      }
      clearHashFromUrl();
    }

    function flashElement(el: HTMLElement) {
      if (highlightedRef.current && highlightedRef.current !== el) {
        cleanupFlash(highlightedRef.current);
        highlightedRef.current.removeEventListener('animationend', onAnimationEnd);
      }
      el.removeEventListener('animationend', onAnimationEnd);

      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      flashAfterScroll(el, onAnimationEnd, () => {
        highlightedRef.current = el;
      });
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
      // Don't remove the flash class here — clearing the hash (after animation)
      // or a subsequent flash on the same target handles teardown.
    };
  }, [hash, depsKey, navigate, pathname, search]);
}
