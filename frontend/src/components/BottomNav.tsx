import { useState } from 'react';
import { Link, useMatch, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Utensils, PawPrint, HeartPulse, Settings, ChevronRight } from 'lucide-react';
import { useSelectedPet } from '../context/SelectedPetContext';
import {
  useNotificationActions,
  useNotificationList,
  useNotificationUnreadCount,
} from '../hooks/useNotifications';
import { resolvePetColor } from '../lib/petColors';
import { NotificationRow } from './NotificationRow';
import { PetAvatar } from './pet/PetAvatar';
import { BottomNavLink } from './BottomNavLink';

export function BottomNav() {
  const [petSheetOpen, setPetSheetOpen] = useState(false);
  const { pets, petsLoading, selectedPetId, selectedPet, setSelectedPetId } = useSelectedPet();
  const navigate = useNavigate();
  const onPetProfile = useMatch('/pets/:id');

  const unreadQuery = useNotificationUnreadCount();
  const listQuery = useNotificationList(petSheetOpen);
  const { markAllReadMutation, openNotification } = useNotificationActions(() => setPetSheetOpen(false));

  const petColor = selectedPet ? resolvePetColor(selectedPet.species, selectedPet.color) : 'var(--accent)';
  const unreadCount = unreadQuery.data?.count ?? 0;
  const notifications = listQuery.data ?? [];
  const hasUnreadNotifications = notifications.some((item) => !item.read);
  const petTabLabel = selectedPet?.name ?? 'Pet';

  function selectPet(id: string) {
    setSelectedPetId(id);
    if (onPetProfile) navigate(`/pets/${id}`);
    setPetSheetOpen(false);
  }

  const petButtonLabel = unreadCount > 0
    ? `${petTabLabel}, ${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`
    : petTabLabel;

  return (
    <>
      {petSheetOpen && (
        <div className="bottom-nav-backdrop" onClick={() => setPetSheetOpen(false)} />
      )}

      {petSheetOpen && (
        <div className="bottom-nav-sheet" role="dialog" aria-label="Pet, notifications, and settings">
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
            <>
              <Link
                to="/pets"
                className="bottom-nav-sheet-pet bottom-nav-sheet-footer-link"
                onClick={() => setPetSheetOpen(false)}
              >
                <PawPrint size={20} style={{ opacity: 0.6 }} />
                <span>Manage pets</span>
                <ChevronRight size={16} style={{ marginLeft: 'auto', opacity: 0.4 }} />
              </Link>
              <Link
                to="/settings"
                className="bottom-nav-sheet-pet bottom-nav-sheet-footer-link"
                onClick={() => setPetSheetOpen(false)}
              >
                <Settings size={20} style={{ opacity: 0.6 }} />
                <span>Settings</span>
                <ChevronRight size={16} style={{ marginLeft: 'auto', opacity: 0.4 }} />
              </Link>
            </>
          )}

          <div className="bottom-nav-sheet-divider" aria-hidden="true" />

          <div className="bottom-nav-sheet-section-header">
            <p className="eyebrow bottom-nav-sheet-title bottom-nav-sheet-title-inline">Notifications</p>
            {hasUnreadNotifications && (
              <button
                type="button"
                className="bottom-nav-sheet-manage"
                disabled={markAllReadMutation.isPending}
                onClick={() => markAllReadMutation.mutate()}
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="bottom-nav-sheet-notifications">
            {listQuery.isLoading && <p className="notification-empty">Loading…</p>}
            {!listQuery.isLoading && notifications.length === 0 && (
              <p className="notification-empty">No notifications yet.</p>
            )}
            {notifications.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                compact
                onOpen={openNotification}
              />
            ))}
          </div>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Main navigation">
        <BottomNavLink to="/" end>
          <LayoutDashboard size={20} />
          <span>Home</span>
        </BottomNavLink>

        <BottomNavLink to="/nutrition">
          <Utensils size={20} />
          <span>Food</span>
        </BottomNavLink>

        <BottomNavLink to="/elimination">
          <PawPrint size={20} />
          <span>Toilet</span>
        </BottomNavLink>

        <BottomNavLink to="/health">
          <HeartPulse size={20} />
          <span>Health</span>
        </BottomNavLink>

        <button
          type="button"
          className={`bottom-nav-item bottom-nav-pet${petSheetOpen ? ' active' : ''}`}
          onClick={() => setPetSheetOpen((value) => !value)}
          aria-label={petButtonLabel}
          aria-expanded={petSheetOpen}
        >
          <span className="bottom-nav-pet-avatar-wrap">
            {selectedPet ? (
              <PetAvatar
                species={selectedPet.species}
                name={selectedPet.name}
                color={petColor}
                circleBg={`${petColor}28`}
                size={26}
              />
            ) : (
              <PawPrint size={20} />
            )}
            {unreadCount > 0 && (
              <span className="bottom-nav-pet-unread-dot" aria-hidden="true" />
            )}
          </span>
          <span className="bottom-nav-pet-label">{petTabLabel}</span>
        </button>
      </nav>
    </>
  );
}
