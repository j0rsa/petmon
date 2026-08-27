import { afterEach, describe, expect, it } from 'vitest';
import { medIntakeImportPlatform, showMedIntakeShortcutLink } from './medIntakePlatform';

function mockUserAgent(userAgent: string, platform?: string) {
  Object.defineProperty(globalThis.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
  Object.defineProperty(globalThis.navigator, 'userAgentData', {
    configurable: true,
    value: platform ? { platform } : undefined,
  });
}

describe('medIntakeImportPlatform', () => {
  afterEach(() => {
    mockUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
  });

  it('does not show shortcut link on Android', () => {
    mockUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    );
    expect(medIntakeImportPlatform()).toBe('other');
    expect(showMedIntakeShortcutLink()).toBe(false);
  });

  it('does not show shortcut link on desktop', () => {
    mockUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    expect(medIntakeImportPlatform()).toBe('other');
    expect(showMedIntakeShortcutLink()).toBe(false);
  });

  it('shows shortcut link on iOS', () => {
    mockUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    );
    expect(medIntakeImportPlatform()).toBe('ios');
    expect(showMedIntakeShortcutLink()).toBe(true);
  });

  it('detects iOS from userAgentData platform hint', () => {
    mockUserAgent(
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36',
      'iOS',
    );
    expect(medIntakeImportPlatform()).toBe('ios');
    expect(showMedIntakeShortcutLink()).toBe(true);
  });
});
