export type MedIntakeImportPlatform = 'android' | 'ios' | 'desktop';

/** Detect which med-intake import link(s) to show for the current device. */
export function medIntakeImportPlatform(): MedIntakeImportPlatform {
  if (typeof navigator === 'undefined') {
    return 'desktop';
  }

  const ua = navigator.userAgent;
  const platformHint = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;

  if (/Android/i.test(ua) || platformHint === 'Android') {
    return 'android';
  }

  if (/iPhone|iPad|iPod/i.test(ua) || platformHint === 'iOS') {
    return 'ios';
  }

  return 'desktop';
}

export function showMedIntakeShortcutLink(platform = medIntakeImportPlatform()): boolean {
  return platform === 'ios' || platform === 'desktop';
}

export function showMedIntakeAutomateLink(platform = medIntakeImportPlatform()): boolean {
  return platform === 'android' || platform === 'desktop';
}
