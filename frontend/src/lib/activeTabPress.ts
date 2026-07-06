const SCROLL_TOP_THRESHOLD = 2;

export function isAtScrollTop(): boolean {
  return window.scrollY <= SCROLL_TOP_THRESHOLD;
}

/** Scroll to top when re-tapping an active tab; reload if already at the top. */
export function handleActiveTabPress(event: { preventDefault: () => void }): void {
  event.preventDefault();
  if (isAtScrollTop()) {
    window.location.reload();
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
