import { describe, expect, it } from 'vitest';
import {
  medIntakeShortcutFileUrl,
  medIntakeShortcutHref,
  medIntakeShortcutLinkProps,
} from './medIntakeShortcut';

const ICLOUD = 'https://www.icloud.com/shortcuts/abc123def4';

describe('medIntakeShortcut', () => {
  it('builds absolute file URL from origin', () => {
    expect(medIntakeShortcutFileUrl('http://192.168.1.10:5173')).toBe(
      'http://192.168.1.10:5173/api/v1/shortcuts/meds/intake.shortcut',
    );
  });

  it('uses iCloud share link when configured', () => {
    expect(medIntakeShortcutHref('https://petmon.j0rsa.com', ICLOUD)).toBe(ICLOUD);
    expect(medIntakeShortcutLinkProps('https://petmon.j0rsa.com', ICLOUD).href).toBe(ICLOUD);
    expect(medIntakeShortcutLinkProps('https://petmon.j0rsa.com', ICLOUD).download).toBeUndefined();
  });

  it('falls back to self-hosted file when iCloud link is missing', () => {
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    });
    expect(medIntakeShortcutHref('https://petmon.j0rsa.com')).toBe(
      'https://petmon.j0rsa.com/api/v1/shortcuts/meds/intake.shortcut',
    );
  });

  it('downloads directly on desktop without iCloud link', () => {
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
    });
    expect(medIntakeShortcutHref('http://localhost:5173')).toBe(
      'http://localhost:5173/api/v1/shortcuts/meds/intake.shortcut',
    );
    expect(medIntakeShortcutLinkProps('http://localhost:5173').download).toBe('Petmon Take Meds.shortcut');
  });
});
