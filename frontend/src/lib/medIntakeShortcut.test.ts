import { describe, expect, it } from 'vitest';
import {
  medIntakeShortcutFileUrl,
  medIntakeShortcutHref,
  medIntakeShortcutLinkProps,
} from './medIntakeShortcut';

describe('medIntakeShortcut', () => {
  it('builds absolute file URL from origin', () => {
    expect(medIntakeShortcutFileUrl('http://192.168.1.10:5173')).toBe(
      'http://192.168.1.10:5173/api/v1/shortcuts/med-intake.shortcut',
    );
  });

  it('uses shortcuts import scheme on iPhone', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)';
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      configurable: true,
      value: ua,
    });
    const href = medIntakeShortcutHref('https://petmon.j0rsa.com');
    expect(href.startsWith('shortcuts://import-shortcut/?')).toBe(true);
    expect(href).toContain(encodeURIComponent('https://petmon.j0rsa.com/api/v1/shortcuts/med-intake.shortcut'));
    expect(medIntakeShortcutLinkProps('https://petmon.j0rsa.com').download).toBeUndefined();
  });

  it('downloads directly on desktop', () => {
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
    });
    expect(medIntakeShortcutHref('http://localhost:5173')).toBe(
      'http://localhost:5173/api/v1/shortcuts/med-intake.shortcut',
    );
    expect(medIntakeShortcutLinkProps('http://localhost:5173').download).toBe('petmon-med-intake.shortcut');
  });
});
