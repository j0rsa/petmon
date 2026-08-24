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
 * Prefer the iCloud share link from server config (iPhone import).
 * Otherwise download/open the self-hosted signed file.
 */
export function medIntakeShortcutHref(
  origin = typeof window !== 'undefined' ? window.location.origin : '',
  icloudUrl?: string | null,
): string {
  const trimmed = icloudUrl?.trim();
  if (trimmed) {
    return trimmed;
  }
  return medIntakeShortcutFileUrl(origin);
}

export function medIntakeShortcutLinkProps(
  origin = typeof window !== 'undefined' ? window.location.origin : '',
  icloudUrl?: string | null,
) {
  const appleMobile = isAppleMobile();
  const href = medIntakeShortcutHref(origin, icloudUrl);
  const usesIcloud = Boolean(icloudUrl?.trim());
  return {
    href,
    download: appleMobile || usesIcloud ? undefined : 'petmon-med-intake.shortcut',
  } as const;
}

export { SHORTCUT_NAME };
