import { useState } from 'react';
import { NavLink, Link, useMatch, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Utensils, PawPrint, Settings } from 'lucide-react';
import { useSelectedPet } from '../context/SelectedPetContext';
import { resolvePetColor } from '../lib/petColors';
import { PetAvatar } from './pet/PetAvatar';

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
          <p className="eyebrow" style={{ padding: '0 1rem 0.75rem' }}>Switch pet</p>
          {petsLoading && <p className="muted-text" style={{ padding: '0 1rem' }}>Loading…</p>}
          {!petsLoading && pets.length === 0 && (
            <div style={{ padding: '0 1rem 1rem' }}>
              <p className="muted-text">No pets yet.</p>
              <Link
                className="button button-secondary button-compact"
                to="/pets"
                onClick={() => setPetSheetOpen(false)}
                style={{ marginTop: '0.5rem' }}
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
        </div>
      )}

      {/* Bottom nav bar */}
      <nav className="bottom-nav" aria-label="Main navigation">
        <NavLink to="/" end className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
          <LayoutDashboard size={22} />
          <span>Overview</span>
        </NavLink>

        <NavLink to="/nutrition" className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
          <Utensils size={22} />
          <span>Nutrition</span>
        </NavLink>

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

        <NavLink to="/pets" className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
          <PawPrint size={22} />
          <span>Pets</span>
        </NavLink>

        <NavLink to="/settings" className={({ isActive }) => `bottom-nav-item${isActive ? ' active' : ''}`}>
          <Settings size={22} />
          <span>Settings</span>
        </NavLink>
      </nav>
    </>
  );
}
