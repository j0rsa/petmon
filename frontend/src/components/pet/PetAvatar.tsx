import { PetSilhouette } from './PetSilhouette';
import type { PetSpecies } from '../../types';

interface PetAvatarProps {
  species: PetSpecies;
  name: string;
  color?: string;
  photoUrl?: string;
  size?: number;
  className?: string;
  circleBg?: string;
}

export function PetAvatar({ species, name, color, photoUrl, size = 128, className = '', circleBg }: PetAvatarProps) {
  return (
    <div className={`pet-avatar ${className}`.trim()} style={{ width: size, height: size }}>
      <div className="pet-avatar-circle" style={{ width: size, height: size, ...(circleBg ? { background: circleBg } : {}) }}>
        {photoUrl ? (
          <img className="pet-avatar-photo" src={photoUrl} alt={`${name} photo`} />
        ) : (
          <PetSilhouette species={species} color={color} />
        )}
      </div>
    </div>
  );
}
