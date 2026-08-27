export type MedIntakeImportPlatform = 'ios' | 'other';

/** Detect whether the current device is iOS. */
export function medIntakeImportPlatform(): MedIntakeImportPlatform {
  if (typeof navigator === 'undefined') {
    return 'other';
  }

  const ua = navigator.userAgent;
  const platformHint = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;

  if (/iPhone|iPad|iPod/i.test(ua) || platformHint === 'iOS') {
    return 'ios';
  }

  return 'other';
}

/** The Apple Shortcuts import link is only useful on iOS. */
export function showMedIntakeShortcutLink(platform = medIntakeImportPlatform()): boolean {
  return platform === 'ios';
}
