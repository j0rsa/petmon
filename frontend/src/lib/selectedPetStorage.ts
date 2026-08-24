export const SELECTED_PET_STORAGE_KEY = 'petmon-selected-pet-id';

export function readStoredPetId(): string | null {
  try {
    return localStorage.getItem(SELECTED_PET_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function writeStoredPetId(id: string): void {
  try {
    localStorage.setItem(SELECTED_PET_STORAGE_KEY, id);
  } catch {
    // ignore storage errors
  }
}

export function clearStoredPetId(): void {
  try {
    localStorage.removeItem(SELECTED_PET_STORAGE_KEY);
  } catch {
    // ignore storage errors
  }
}

/** `undefined` pets means the list has not loaded yet — keep the stored id. */
export function resolveSelectedPetId(
  loadedPets: { id: string }[] | undefined,
  preferredId: string | null,
): string | null {
  if (loadedPets === undefined) return preferredId;
  if (loadedPets.length === 0) return null;
  if (preferredId && loadedPets.some((pet) => pet.id === preferredId)) return preferredId;
  return loadedPets[0].id;
}
