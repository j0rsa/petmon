import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStoredPetId,
  readStoredPetId,
  resolveSelectedPetId,
  SELECTED_PET_STORAGE_KEY,
  writeStoredPetId,
} from './selectedPetStorage';

const mittens = { id: 'mittens' };
const rex = { id: 'rex' };
const pets = [mittens, rex];

describe('resolveSelectedPetId', () => {
  it('keeps the stored id while pets have not loaded', () => {
    expect(resolveSelectedPetId(undefined, rex.id)).toBe(rex.id);
  });

  it('restores the stored pet after pets load (page refresh)', () => {
    const stored = resolveSelectedPetId(undefined, rex.id);
    expect(resolveSelectedPetId(pets, stored)).toBe(rex.id);
  });

  it('does not treat a loading empty list as “no pets”', () => {
    // Treating `[]` as loaded would wipe the stored id, then default to the first pet.
    expect(resolveSelectedPetId([], rex.id)).toBeNull();
    expect(resolveSelectedPetId(pets, null)).toBe(mittens.id);
  });

  it('defaults to the first pet when nothing is stored', () => {
    expect(resolveSelectedPetId(pets, null)).toBe(mittens.id);
  });

  it('defaults to the first pet when the stored id is gone', () => {
    expect(resolveSelectedPetId(pets, 'deleted')).toBe(mittens.id);
  });

  it('clears selection when the loaded list is empty', () => {
    expect(resolveSelectedPetId([], rex.id)).toBeNull();
  });
});

describe('selected pet localStorage', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
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
    vi.unstubAllGlobals();
  });

  it('round-trips the selected pet id', () => {
    expect(readStoredPetId()).toBeNull();
    writeStoredPetId(rex.id);
    expect(store.get(SELECTED_PET_STORAGE_KEY)).toBe(rex.id);
    expect(readStoredPetId()).toBe(rex.id);
    clearStoredPetId();
    expect(readStoredPetId()).toBeNull();
  });
});
