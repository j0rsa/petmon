import { useState } from 'react';
import { Link, useMatch, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Utensils, PawPrint, Settings, ChevronRight } from 'lucide-react';
import { useSelectedPet } from '../context/SelectedPetContext';
import { resolvePetColor } from '../lib/petColors';
import { PetAvatar } from './pet/PetAvatar';
import { BottomNavLink } from './BottomNavLink';

export function BottomNav() {
  const [petSheetOpen, setPetSheetOpen] = useState(false);
  const { pets, petsLoading, selectedPetId, selectedPet, setSelectedPetId } = useSelectedPet();
  const navigate = useNavigate();
  const onPetProfile = useMatch('/pets/:id');

  const petColor = selectedPet ? resolvePetColor(selectedPet.species, selectedPet.color) : 'var(--accent)';

  function selectPet(id: string) {
    setSelectedPetId(id);
    if (onPetProfile) navigate(`/pets/${id}`);
    setPetSheetOpen(false);
  }

  return (
    <>
      {/* Pet sheet backdrop */}
      {petSheetOpen && (
        <div className="bottom-nav-backdrop" onClick={() => setPetSheetOpen(false)} />
      )}

      {/* Pet sheet */}
      {petSheetOpen && (
        <div className="bottom-nav-sheet">
          <div className="bottom-nav-sheet-handle" />
          <p className="eyebrow bottom-nav-sheet-title">Switch pet</p>
          {petsLoading && <p className="muted-text bottom-nav-sheet-subtitle">Loading…</p>}
          {!petsLoading && pets.length === 0 && (
            <div className="bottom-nav-empty">
              <p className="muted-text">No pets yet.</p>
              <Link
                className="button button-secondary"
                to="/pets"
                onClick={() => setPetSheetOpen(false)}
              >
                Add a pet
              </Link>
            </div>
          )}
          {!petsLoading && pets.map((pet) => {
            const color = resolvePetColor(pet.species, pet.color);
            const selected = pet.id === selectedPetId;
            return (
              <button
                key={pet.id}
                type="button"
                className={`bottom-nav-sheet-pet${selected ? ' selected' : ''}`}
                onClick={() => selectPet(pet.id)}
              >
                <PetAvatar species={pet.species} name={pet.name} color={color} circleBg={`${color}28`} size={36} />
                <span>{pet.name}</span>
                {selected && <span className="bottom-nav-sheet-check">✓</span>}
              </button>
            );
          })}
          {!petsLoading && (
            <Link
              to="/pets"
              className="bottom-nav-sheet-pet bottom-nav-sheet-footer-link"
              onClick={() => setPetSheetOpen(false)}
            >
              <PawPrint size={20} style={{ opacity: 0.6 }} />
              <span>Manage pets</span>
              <ChevronRight size={16} style={{ marginLeft: 'auto', opacity: 0.4 }} />
            </Link>
          )}
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="bottom-nav" aria-label="Main navigation">
        <BottomNavLink to="/" end>
          <LayoutDashboard size={22} />
          <span>Overview</span>
        </BottomNavLink>

        <BottomNavLink to="/nutrition">
          <Utensils size={22} />
          <span>Nutrition</span>
        </BottomNavLink>

        {/* Pet switcher tab */}
        <button
          type="button"
          className={`bottom-nav-item bottom-nav-pet${petSheetOpen ? ' active' : ''}`}
          onClick={() => setPetSheetOpen((v) => !v)}
          aria-label="Switch pet"
        >
          {selectedPet ? (
            <PetAvatar
              species={selectedPet.species}
              name={selectedPet.name}
              color={petColor}
              circleBg={`${petColor}28`}
              size={28}
            />
          ) : (
            <PawPrint size={22} />
          )}
          <span>{selectedPet?.name ?? 'Pet'}</span>
        </button>

        <BottomNavLink to="/settings">
          <Settings size={22} />
          <span>Settings</span>
        </BottomNavLink>
      </nav>
    </>
  );
}
