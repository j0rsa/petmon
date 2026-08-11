import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSignedOut, isSignedOut, markSignedOut } from './auth';

describe('signed-out session flag', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
  });

  afterEach(() => {
    clearSignedOut();
    vi.unstubAllGlobals();
  });

  it('starts false and can be marked', () => {
    expect(isSignedOut()).toBe(false);
    markSignedOut();
    expect(isSignedOut()).toBe(true);
    clearSignedOut();
    expect(isSignedOut()).toBe(false);
  });
});
