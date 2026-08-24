const SHORTCUT_NAME = 'Petmon Take Meds';
const SHORTCUT_PATH = '/api/v1/shortcuts/med-intake.shortcut';

function isAppleMobile(): boolean {
  return typeof navigator !== 'undefined'
    && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

/** Absolute URL to the signed shortcut file on this host. */
export function medIntakeShortcutFileUrl(origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  return `${origin}${SHORTCUT_PATH}`;
}

/**
 * On iPhone/iPad, open Shortcuts import UI directly.
 * Elsewhere, download the .shortcut file.
 */
export function medIntakeShortcutHref(origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  const fileUrl = medIntakeShortcutFileUrl(origin);
  if (!isAppleMobile()) {
    return fileUrl;
  }
  const params = new URLSearchParams({
    url: fileUrl,
    name: SHORTCUT_NAME,
  });
  return `shortcuts://import-shortcut/?${params.toString()}`;
}

export function medIntakeShortcutLinkProps(origin = typeof window !== 'undefined' ? window.location.origin : '') {
  const appleMobile = isAppleMobile();
  return {
    href: medIntakeShortcutHref(origin),
    download: appleMobile ? undefined : 'petmon-med-intake.shortcut',
  } as const;
}
