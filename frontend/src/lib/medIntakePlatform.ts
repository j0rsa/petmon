export type MedIntakeImportPlatform = 'ios' | 'macos' | 'other';

/** Detect whether the current device can import Apple Shortcuts. */
export function medIntakeImportPlatform(): MedIntakeImportPlatform {
  if (typeof navigator === 'undefined') {
    return 'other';
  }

  const ua = navigator.userAgent;
  const platformHint = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform;

  if (/iPhone|iPad|iPod/i.test(ua) || platformHint === 'iOS') {
    return 'ios';
  }

  if (/Macintosh/i.test(ua) || platformHint === 'macOS') {
    return 'macos';
  }

  return 'other';
}

/** The Apple Shortcuts import link is shown on iOS and macOS (Shortcuts app is available on both). */
export function showMedIntakeShortcutLink(platform = medIntakeImportPlatform()): boolean {
  return platform === 'ios' || platform === 'macos';
}
