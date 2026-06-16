import { PET_SPECIES_LABELS, PET_STATUS_LABELS, type Pet } from '../../types';

function formatBirthDate(value?: string) {
  if (!value) return '—';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

interface PetInfoFieldsProps {
  pet: Pet;
}

export function PetInfoFields({ pet }: PetInfoFieldsProps) {
  const rows = [
    { label: 'Species', value: PET_SPECIES_LABELS[pet.species] },
    { label: 'Breed', value: pet.breed?.trim() || '—' },
    { label: 'Birth date', value: formatBirthDate(pet.birth_date) },
    { label: 'Color', value: pet.color?.trim() || '—' },
    { label: 'Blood type', value: pet.blood_type?.trim() || '—' },
    { label: 'Status', value: PET_STATUS_LABELS[pet.status] },
    { label: 'Weight', value: pet.weight_kg != null ? `${pet.weight_kg} kg` : '—' },
  ];

  return (
    <dl className="pet-info-fields">
      {rows.map((row) => (
        <div key={row.label} className="pet-info-row">
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
      {pet.feeding_notes?.trim() && (
        <div className="pet-info-row pet-info-row-full">
          <dt>Feeding notes</dt>
          <dd>{pet.feeding_notes}</dd>
        </div>
      )}
      {pet.telegram_chat_id?.trim() && (
        <div className="pet-info-row">
          <dt>Telegram chat</dt>
          <dd style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}>{pet.telegram_chat_id}</dd>
        </div>
      )}
      {pet.telegram_thread_id?.trim() && (
        <div className="pet-info-row">
          <dt>Telegram thread</dt>
          <dd style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}>{pet.telegram_thread_id}</dd>
        </div>
      )}
    </dl>
  );
}
