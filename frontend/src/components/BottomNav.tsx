import { useState } from 'react';
import { NavLink, Link, useMatch, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Layers, PawPrint, Settings } from 'lucide-react';
import { useSelectedPet } from '../context/SelectedPetContext';
import { resolvePetColor } from '../lib/petColors';
import { PetAvatar } from './pet/PetAvatar';
import { PILLARS } from '../types/pillars';

export function BottomNav() {
  const [petSheetOpen, setPetSheetOpen] = useState(false);
  const [sectionSheetOpen, setSectionSheetOpen] = useState(false);
  const { pets, petsLoading, selectedPetId, selectedPet, setSelectedPetId } = useSelectedPet();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const onPetProfile = useMatch('/pets/:id');

  const petColor = selectedPet ? resolvePetColor(selectedPet.species, selectedPet.color) : 'var(--accent)';

  function selectPet(id: string) {
    setSelectedPetId(id);
    if (onPetProfile) navigate(`/pets/${id}`);
    setPetSheetOpen(false);
  }

  function closeAll() {
    setPetSheetOpen(false);
    setSectionSheetOpen(false);
  }

  function activePillarRoute(): string | null {
    for (const p of PILLARS) {
      if (pathname === p.route || pathname.startsWith(`${p.route}/`)) {
        return p.route;
      }
    }
    return null;
  }

  const activePillar = activePillarRoute();
  const anySheetOpen = petSheetOpen || sectionSheetOpen;

  return (
    <>
      {/* Backdrop */}
      {anySheetOpen && (
        <div className="bottom-nav-backdrop" onClick={closeAll} />
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
                onClick={closeAll}
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

      {/* Sections (pillar) sheet */}
      {sectionSheetOpen && (
        <div className="bottom-nav-sheet">
          <div className="bottom-nav-sheet-handle" />
          <p className="eyebrow" style={{ padding: '0 1rem 0.75rem' }}>Sections</p>
          {PILLARS.map((pillar) => {
            const isActive = activePillar === pillar.route;
            return (
              <button
                key={pillar.id}
                type="button"
                disabled={!pillar.available}
                className={`bottom-nav-sheet-pet${isActive ? ' selected' : ''}${!pillar.available ? ' nav-link-muted' : ''}`}
                style={{ opacity: pillar.available ? 1 : 0.45, cursor: pillar.available ? 'pointer' : 'not-allowed' }}
                onClick={() => {
                  if (pillar.available) {
                    navigate(pillar.route);
                    setSectionSheetOpen(false);
                  }
                }}
              >
                <span style={{ flex: 1, textAlign: 'left' }}>{pillar.label}</span>
                {isActive && <span className="bottom-nav-sheet-check">✓</span>}
                {!pillar.available && (
                  <span className="nav-soon" style={{ marginLeft: 'auto' }}>soon</span>
                )}
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

        {/* Sections button */}
        <button
          type="button"
          className={`bottom-nav-item${sectionSheetOpen || activePillar !== null ? ' active' : ''}`}
          onClick={() => { setSectionSheetOpen((v) => !v); setPetSheetOpen(false); }}
          aria-label="Switch section"
        >
          <Layers size={22} />
          <span>Sections</span>
        </button>

        {/* Pet switcher tab */}
        <button
          type="button"
          className={`bottom-nav-item bottom-nav-pet${petSheetOpen ? ' active' : ''}`}
          onClick={() => { setPetSheetOpen((v) => !v); setSectionSheetOpen(false); }}
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
