import type { PetSpecies } from '../types';

export const DEFAULT_SPECIES_COLORS: Record<PetSpecies, string> = {
  cat: '#c4a882',
  dog: '#8b6f47',
  bunny: '#e8d5c4',
  parrot: '#2d8a5e',
  other: '#94a3b8',
};

export function resolvePetColor(species: PetSpecies, color?: string) {
  const trimmed = color?.trim();
  if (trimmed) return trimmed;
  return DEFAULT_SPECIES_COLORS[species];
}
