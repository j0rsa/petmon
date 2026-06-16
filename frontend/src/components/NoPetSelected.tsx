import { Link } from 'react-router-dom';
import { useSelectedPet } from '../context/SelectedPetContext';

export function NoPetSelected() {
  const { petsLoading, pets } = useSelectedPet();

  if (petsLoading) {
    return <div className="loading-state">Loading…</div>;
  }

  return (
    <div className="empty-state">
      <p>{pets.length === 0 ? 'Add a pet profile to view and log data.' : 'Select a pet in the sidebar.'}</p>
      {pets.length === 0 && (
        <Link className="button button-secondary button-compact" to="/pets">
          Add a pet
        </Link>
      )}
    </div>
  );
}
