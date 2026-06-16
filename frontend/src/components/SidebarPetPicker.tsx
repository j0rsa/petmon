import { Link, useMatch, useNavigate } from 'react-router-dom';
import { useSelectedPet } from '../context/SelectedPetContext';
import { resolvePetColor } from '../lib/petColors';
import { PetAvatar } from './pet/PetAvatar';

export function SidebarPetPicker() {
  const { pets, petsLoading, selectedPetId, setSelectedPetId } = useSelectedPet();
  const navigate = useNavigate();
  const onPetProfile = useMatch('/pets/:id');

  if (petsLoading) {
    return (
      <div className="sidebar-pet-picker">
        <p className="eyebrow">Pet</p>
        <p className="muted-text">Loading…</p>
      </div>
    );
  }

  if (pets.length === 0) {
    return (
      <div className="sidebar-pet-picker">
        <p className="eyebrow">Pet</p>
        <p className="muted-text">Add a pet to start logging.</p>
        <Link className="button button-secondary button-compact" to="/pets">
          Add a pet
        </Link>
      </div>
    );
  }

  return (
    <div className="sidebar-pet-picker">
      <p className="eyebrow">Pet</p>
      <div className="sidebar-pet-avatars" role="listbox" aria-label="Selected pet">
        {pets.map((pet) => {
          const selected = pet.id === selectedPetId;
          const petColor = resolvePetColor(pet.species, pet.color);
          return (
            <button
              key={pet.id}
              type="button"
              role="option"
              aria-selected={selected}
              className={`sidebar-pet-avatar-btn${selected ? ' selected' : ''}`}
              onClick={() => {
                setSelectedPetId(pet.id);
                if (onPetProfile) navigate(`/pets/${pet.id}`);
              }}
              title={pet.name}
            >
              <PetAvatar
                species={pet.species}
                name={pet.name}
                color={petColor}
                circleBg={`${petColor}28`}
                size={40}
              />
              <span className="sidebar-pet-avatar-name">{pet.name}</span>
            </button>
          );
        })}
      </div>
      {selectedPetId && (
        <Link className="text-link sidebar-pet-profile-link" to={`/pets/${selectedPetId}`}>
          Open profile →
        </Link>
      )}
    </div>
  );
}
