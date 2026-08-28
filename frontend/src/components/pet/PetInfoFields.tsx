import { useState } from 'react';
import { Copy } from 'lucide-react';
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
  const [idCopied, setIdCopied] = useState(false);
  const telegramChats = [...new Set([
    pet.telegram_nutrition_chat_id?.trim(),
    pet.telegram_meds_chat_id?.trim(),
  ].filter((chat): chat is string => Boolean(chat)))];
  const rows = [
    { label: 'Species', value: PET_SPECIES_LABELS[pet.species] },
    { label: 'Breed', value: pet.breed?.trim() || '—' },
    { label: 'Birth date', value: formatBirthDate(pet.birth_date) },
    { label: 'Color', value: pet.color?.trim() || '—' },
    { label: 'Blood type', value: pet.blood_type?.trim() || '—' },
    { label: 'Status', value: PET_STATUS_LABELS[pet.status] },
  ];

  return (
    <dl className="pet-info-fields">
      <div className="pet-info-row pet-info-row-full">
        <dt>Pet ID</dt>
        <dd className="pet-info-id">
          <code className="pet-info-id__value">{pet.id}</code>
          <button
            type="button"
            className="button button-secondary pet-info-id__copy"
            aria-label={idCopied ? 'Copied pet ID' : 'Copy pet ID'}
            title={idCopied ? 'Copied' : 'Copy pet ID'}
            onClick={() => {
              navigator.clipboard.writeText(pet.id).then(() => {
                setIdCopied(true);
                setTimeout(() => setIdCopied(false), 2000);
              });
            }}
          >
            <Copy size={14} aria-hidden="true" />
            <span>{idCopied ? 'Copied' : 'Copy'}</span>
          </button>
        </dd>
      </div>
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
      {telegramChats.length > 0 && (
        <div className="pet-info-row">
          <dt>Telegram chats</dt>
          <dd style={{ fontFamily: 'monospace', fontSize: '0.88rem' }}>{telegramChats.join(', ')}</dd>
        </div>
      )}
      <div className="pet-info-row pet-info-row-full">
        <dt>Auto-tag by duration</dt>
        <dd>{pet.elimination_auto_categorize_by_duration ? 'Enabled' : 'Disabled'}</dd>
      </div>
    </dl>
  );
}
