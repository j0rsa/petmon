const FLOW_NAME = 'Petmon Take Meds';
const FLOW_FILENAME = 'Petmon Take Meds.flo';
const FLOW_PATH = '/api/v1/shortcuts/meds/intake.flo';

function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

/** Absolute URL to the AutoMate flow file on this host. */
export function medIntakeAutomateFileUrl(origin = typeof window !== 'undefined' ? window.location.origin : ''): string {
  return `${origin}${FLOW_PATH}`;
}

/**
 * Prefer the Automate Community link from server config when set.
 * Otherwise download the self-hosted `.flo` file (works on Android).
 */
export function medIntakeAutomateHref(
  origin = typeof window !== 'undefined' ? window.location.origin : '',
  communityUrl?: string | null,
): string {
  const trimmed = communityUrl?.trim();
  if (trimmed) {
    return trimmed;
  }
  return medIntakeAutomateFileUrl(origin);
}

export function medIntakeAutomateLinkProps(
  origin = typeof window !== 'undefined' ? window.location.origin : '',
  communityUrl?: string | null,
) {
  const href = medIntakeAutomateHref(origin, communityUrl);
  const usesCommunity = Boolean(communityUrl?.trim());
  return {
    href,
    download: usesCommunity ? undefined : FLOW_FILENAME,
  } as const;
}

export { FLOW_NAME, FLOW_FILENAME, FLOW_PATH, isAndroid };
