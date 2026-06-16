import bunnySilhouette from '../../assets/silhouettes/bunny.svg?raw';
import catSilhouette from '../../assets/silhouettes/cat.svg?raw';
import dogSilhouette from '../../assets/silhouettes/dog.svg?raw';
import otherSilhouette from '../../assets/silhouettes/other.svg?raw';
import parrotSilhouette from '../../assets/silhouettes/parrot.svg?raw';
import { parseSvgAsset, type SvgAsset } from '../../lib/svgAsset';
import type { PetSpecies } from '../../types';

const SILHOUETTE_SVG_BY_SPECIES: Record<PetSpecies, string> = {
  cat: catSilhouette,
  dog: dogSilhouette,
  bunny: bunnySilhouette,
  parrot: parrotSilhouette,
  other: otherSilhouette,
};

const parsedSilhouettes = Object.fromEntries(
  (Object.entries(SILHOUETTE_SVG_BY_SPECIES) as [PetSpecies, string][]).map(([species, svg]) => [
    species,
    parseSvgAsset(svg),
  ]),
) as Record<PetSpecies, SvgAsset>;

export function silhouetteShapeFor(species: PetSpecies): SvgAsset {
  return parsedSilhouettes[species];
}
