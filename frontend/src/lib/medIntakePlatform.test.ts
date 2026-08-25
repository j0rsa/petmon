import { afterEach, describe, expect, it } from 'vitest';
import {
  medIntakeImportPlatform,
  showMedIntakeAutomateLink,
  showMedIntakeShortcutLink,
} from './medIntakePlatform';

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

  it('detects Android from user agent', () => {
    mockUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    );
    expect(medIntakeImportPlatform()).toBe('android');
    expect(showMedIntakeAutomateLink()).toBe(true);
    expect(showMedIntakeShortcutLink()).toBe(false);
  });

  it('detects Android from userAgentData when UA omits Android', () => {
    mockUserAgent(
      'Mozilla/5.0 (Linux; armv81) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Android',
    );
    expect(medIntakeImportPlatform()).toBe('android');
    expect(showMedIntakeShortcutLink()).toBe(false);
  });

  it('detects iOS', () => {
    mockUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    );
    expect(medIntakeImportPlatform()).toBe('ios');
    expect(showMedIntakeShortcutLink()).toBe(true);
    expect(showMedIntakeAutomateLink()).toBe(false);
  });

  it('shows both links on desktop', () => {
    mockUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    );
    expect(medIntakeImportPlatform()).toBe('desktop');
    expect(showMedIntakeShortcutLink()).toBe(true);
    expect(showMedIntakeAutomateLink()).toBe(true);
  });
});
