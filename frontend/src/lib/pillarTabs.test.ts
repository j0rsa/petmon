import { describe, expect, it } from 'vitest';
import { isPillarJournalActive, isPillarSubTabActive, isPillarTabActive } from './pillarTabs';

const NUTRITION = '/nutrition';

describe('isPillarJournalActive', () => {
  it('is active on the journal index', () => {
    expect(isPillarJournalActive('/nutrition', NUTRITION)).toBe(true);
  });

  it('is active on dated journal URLs', () => {
    expect(isPillarJournalActive('/nutrition/2024-06-15', NUTRITION)).toBe(true);
  });

  it('is not active on sub-routes like analytics', () => {
    expect(isPillarJournalActive('/nutrition/analytics', NUTRITION)).toBe(false);
    expect(isPillarJournalActive('/nutrition/schedules', NUTRITION)).toBe(false);
    expect(isPillarJournalActive('/nutrition/import', NUTRITION)).toBe(false);
  });

  it('does not treat arbitrary segments as journal dates', () => {
    expect(isPillarJournalActive('/nutrition/analytics', NUTRITION)).toBe(false);
    expect(isPillarJournalActive('/nutrition/foo-bar', NUTRITION)).toBe(false);
  });
});

describe('isPillarSubTabActive', () => {
  it('matches only the exact sub-tab path', () => {
    expect(isPillarSubTabActive('/nutrition/analytics', '/nutrition/analytics')).toBe(true);
    expect(isPillarSubTabActive('/nutrition', '/nutrition/analytics')).toBe(false);
    expect(isPillarSubTabActive('/nutrition/analytics/extra', '/nutrition/analytics')).toBe(false);
  });
});

describe('isPillarTabActive', () => {
  it('highlights exactly one nutrition tab per route', () => {
    const tabs = [
      { to: '/nutrition', label: 'Journal' },
      { to: '/nutrition/analytics', label: 'Analytics' },
      { to: '/nutrition/schedules', label: 'Feeding' },
      { to: '/nutrition/import', label: 'Import' },
    ];

    for (const pathname of ['/nutrition', '/nutrition/2024-06-15', '/nutrition/analytics', '/nutrition/schedules', '/nutrition/import']) {
      const active = tabs.filter((tab) => isPillarTabActive(pathname, tab.to, NUTRITION));
      expect(active, pathname).toHaveLength(1);
    }

    expect(isPillarTabActive('/nutrition', '/nutrition', NUTRITION)).toBe(true);
    expect(isPillarTabActive('/nutrition/analytics', '/nutrition', NUTRITION)).toBe(false);
    expect(isPillarTabActive('/nutrition/analytics', '/nutrition/analytics', NUTRITION)).toBe(true);
  });
});
