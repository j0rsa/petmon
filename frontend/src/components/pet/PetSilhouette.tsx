import { resolvePetColor } from '../../lib/petColors';
import type { PetSpecies } from '../../types';
import { silhouetteShapeFor } from './silhouetteShapes';

interface PetSilhouetteProps {
  species: PetSpecies;
  color?: string;
  className?: string;
}

export function PetSilhouette({ species, color, className = '' }: PetSilhouetteProps) {
  const fill = resolvePetColor(species, color);
  const { viewBox, innerMarkup } = silhouetteShapeFor(species);

  return (
    <svg
      className={`pet-silhouette ${className}`.trim()}
      viewBox={viewBox}
      role="img"
      aria-label={`${species} placeholder`}
      fill={fill}
      dangerouslySetInnerHTML={{ __html: innerMarkup }}
    />
  );
}
