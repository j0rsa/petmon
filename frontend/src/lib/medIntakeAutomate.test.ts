import { describe, expect, it } from 'vitest';
import {
  medIntakeAutomateFileUrl,
  medIntakeAutomateHref,
  medIntakeAutomateLinkProps,
} from './medIntakeAutomate';

const COMMUNITY = 'https://llamalab.com/automate/community/flows/99999';

describe('medIntakeAutomate', () => {
  it('builds absolute file URL from origin', () => {
    expect(medIntakeAutomateFileUrl('http://192.168.1.10:5173')).toBe(
      'http://192.168.1.10:5173/api/v1/shortcuts/meds/intake.flo',
    );
  });

  it('uses community link when configured', () => {
    expect(medIntakeAutomateHref('https://petmon.j0rsa.com', COMMUNITY)).toBe(COMMUNITY);
    expect(medIntakeAutomateLinkProps('https://petmon.j0rsa.com', COMMUNITY).href).toBe(COMMUNITY);
    expect(medIntakeAutomateLinkProps('https://petmon.j0rsa.com', COMMUNITY).download).toBeUndefined();
  });

  it('falls back to self-hosted flo when community link is missing', () => {
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)',
    });
    expect(medIntakeAutomateHref('https://petmon.j0rsa.com')).toBe(
      'https://petmon.j0rsa.com/api/v1/shortcuts/meds/intake.flo',
    );
  });

  it('downloads directly on desktop without community link', () => {
    Object.defineProperty(globalThis.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
    });
    expect(medIntakeAutomateLinkProps('http://localhost:5173').download).toBe('Petmon Take Meds.flo');
  });
});
