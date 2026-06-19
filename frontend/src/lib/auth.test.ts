import { describe, expect, it } from 'vitest';
import { deriveDeviceAlias } from './auth';

// Each entry is [description, userAgent, expectedAlias].
// Add new rows here whenever a new UA sample is available.
const cases: [string, string, string][] = [
  [
    'iPhone running iOS 18.7',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1',
    'iPhone (iOS 18.7)',
  ],
  [
    'Samsung Galaxy Z Fold running Android 16',
    'Dalvik/2.1.0 (Linux; U; Android 16; SM-F766B Build/BP4A.251205.006)',
    'SM-F766B (Android 16)',
  ],
];

describe('deriveDeviceAlias', () => {
  it.each(cases)('%s', (_desc, ua, expected) => {
    expect(deriveDeviceAlias(ua)).toBe(expected);
  });

  describe('desktop fallback', () => {
    it('Chrome on macOS', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
      expect(deriveDeviceAlias(ua)).toBe('Chrome on macOS');
    });

    it('Firefox on Windows', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
      expect(deriveDeviceAlias(ua)).toBe('Firefox on Windows');
    });

    it('Edge on Windows', () => {
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36 Edg/136.0.0.0';
      expect(deriveDeviceAlias(ua)).toBe('Edge on Windows');
    });

    it('Safari on macOS', () => {
      const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15';
      expect(deriveDeviceAlias(ua)).toBe('Safari on macOS');
    });
  });

  describe('iOS variants', () => {
    it('iPad running iPadOS 17.4', () => {
      const ua = 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
      expect(deriveDeviceAlias(ua)).toBe('iPad (iOS 17.4)');
    });
  });
});
