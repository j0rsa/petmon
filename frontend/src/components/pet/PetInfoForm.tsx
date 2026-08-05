import { PET_SPECIES, PET_SPECIES_LABELS, PET_STATUSES, PET_STATUS_LABELS, type PetSpecies, type PetStatus } from '../../types';
import { ColorPickerField } from './ColorPickerField';
import { PetAvatar } from './PetAvatar';
import { PetEliminationAutoTagBuckets } from './PetEliminationAutoTagBuckets';

export interface PetInfoFormState {
  name: string;
  species: PetSpecies;
  status: PetStatus;
  breed: string;
  birth_date: string;
  color: string;
  blood_type: string;
  feeding_notes: string;
  telegram_chat_id: string;
  telegram_thread_id: string;
  elimination_auto_categorize_by_duration: boolean;
}

interface PetInfoFormProps {
  form: PetInfoFormState;
  setForm: React.Dispatch<React.SetStateAction<PetInfoFormState>>;
  petId?: string;
  photoUrl?: string;
  onPhotoChange?: (file: File) => void;
  onPhotoRemove?: () => void;
  onSubmit: () => void;
  submitLabel: string;
  onCancel?: () => void;
  loading?: boolean;
}

// eslint-disable-next-line react-refresh/only-export-components
export function petToFormState(pet: {
  name: string;
  species: PetSpecies;
  status: PetStatus;
  breed?: string;
  birth_date?: string;
  color?: string;
  blood_type?: string;
  feeding_notes?: string;
  telegram_chat_id?: string;
  telegram_thread_id?: string;
  elimination_auto_categorize_by_duration?: boolean;
}): PetInfoFormState {
  return {
    name: pet.name,
    species: pet.species,
    status: pet.status,
    breed: pet.breed ?? '',
    birth_date: pet.birth_date ?? '',
    color: pet.color ?? '',
    blood_type: pet.blood_type ?? '',
    feeding_notes: pet.feeding_notes ?? '',
    telegram_chat_id: pet.telegram_chat_id ?? '',
    telegram_thread_id: pet.telegram_thread_id ?? '',
    elimination_auto_categorize_by_duration: pet.elimination_auto_categorize_by_duration ?? false,
  };
}

// eslint-disable-next-line react-refresh/only-export-components
export function formStateToPayload(form: PetInfoFormState) {
  return {
    name: form.name,
    species: form.species,
    status: form.status,
    breed: form.breed.trim() || undefined,
    birth_date: form.birth_date || undefined,
    color: form.color.trim() || undefined,
    blood_type: form.blood_type.trim() || undefined,
    feeding_notes: form.feeding_notes.trim() || undefined,
    telegram_chat_id: form.telegram_chat_id.trim() || undefined,
    telegram_thread_id: form.telegram_thread_id.trim() || undefined,
    elimination_auto_categorize_by_duration: form.elimination_auto_categorize_by_duration,
  };
}

export function PetInfoForm({
  form,
  setForm,
  petId,
  photoUrl,
  onPhotoChange,
  onPhotoRemove,
  onSubmit,
  submitLabel,
  onCancel,
  loading = false,
}: PetInfoFormProps) {
  return (
    <form
      className="pet-info-form"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="pet-info-form-avatar">
        <PetAvatar species={form.species} name={form.name || 'Pet'} color={form.color} photoUrl={photoUrl} size={144} />
        <div className="pet-photo-actions">
          <label className="button button-secondary button-compact" htmlFor="pet-photo-upload">
            Upload photo
          </label>
          <input
            id="pet-photo-upload"
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file && onPhotoChange) onPhotoChange(file);
              event.target.value = '';
            }}
          />
          {photoUrl && onPhotoRemove && (
            <button className="button button-secondary button-compact" type="button" onClick={onPhotoRemove}>
              Remove photo
            </button>
          )}
          <p className="muted-text">Photos are stored locally in your browser.</p>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-row">
          <label htmlFor="pet-info-name">Name</label>
          <input id="pet-info-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} required />
        </div>
        <div className="form-row">
          <label htmlFor="pet-info-species">Species</label>
          <select id="pet-info-species" value={form.species} onChange={(event) => setForm((current) => ({ ...current, species: event.target.value as PetSpecies }))}>
            {PET_SPECIES.map((species) => (
              <option key={species} value={species}>
                {PET_SPECIES_LABELS[species]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="pet-info-breed">Breed</label>
          <input id="pet-info-breed" placeholder="e.g. British Shorthair" value={form.breed} onChange={(event) => setForm((current) => ({ ...current, breed: event.target.value }))} />
        </div>
        <div className="form-row">
          <label htmlFor="pet-info-birth-date">Birth date</label>
          <input id="pet-info-birth-date" type="date" value={form.birth_date} onChange={(event) => setForm((current) => ({ ...current, birth_date: event.target.value }))} />
        </div>
        <div className="form-row">
          <label htmlFor="pet-info-color">Color</label>
          <ColorPickerField
            id="pet-info-color"
            value={form.color}
            placeholder="#c4a882"
            onChange={(value) => setForm((current) => ({ ...current, color: value }))}
          />
        </div>
        <div className="form-row">
          <label htmlFor="pet-info-blood-type">Blood type</label>
          <input id="pet-info-blood-type" placeholder="Optional" value={form.blood_type} onChange={(event) => setForm((current) => ({ ...current, blood_type: event.target.value }))} />
        </div>
        <div className="form-row">
          <label htmlFor="pet-info-status">Status</label>
          <select id="pet-info-status" value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as PetStatus }))}>
            {PET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {PET_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row form-row-full">
          <label htmlFor="pet-info-notes">Feeding notes</label>
          <textarea id="pet-info-notes" rows={4} value={form.feeding_notes} onChange={(event) => setForm((current) => ({ ...current, feeding_notes: event.target.value }))} />
        </div>
        <div className="form-row form-row-full">
          <span className="eyebrow">Telegram notifications</span>
          <p className="muted-text" style={{ fontSize: '0.82rem', marginTop: '0.15rem' }}>
            Records for this pet will be forwarded to the chat below. The bot token is configured globally in Settings.
            Use a group chat ID (negative number, e.g. <code>-100123456789</code>) and optionally a thread/topic ID to route messages to a specific topic within a supergroup.
          </p>
        </div>
        <div className="form-row">
          <label htmlFor="pet-info-tg-chat">Chat ID</label>
          <input id="pet-info-tg-chat" placeholder="-100123456789" value={form.telegram_chat_id} onChange={(event) => setForm((current) => ({ ...current, telegram_chat_id: event.target.value }))} />
        </div>
        <div className="form-row">
          <label htmlFor="pet-info-tg-thread">Thread ID <span style={{ fontWeight: 400, color: 'var(--text-subtle)' }}>(optional)</span></label>
          <input id="pet-info-tg-thread" placeholder="e.g. 42" value={form.telegram_thread_id} onChange={(event) => setForm((current) => ({ ...current, telegram_thread_id: event.target.value }))} />
        </div>
        <div className="form-row form-row-full">
          <span className="eyebrow">Toileting auto-tag</span>
          <p className="muted-text" style={{ fontSize: '0.82rem', marginTop: '0.15rem' }}>
            When enabled, general visits with a logged duration are tagged as Wee or Poop using this pet&apos;s duration history and recent visit patterns. Manage the model below after enabling.
          </p>
        </div>
        <div className="form-row form-row-full">
          <label className="checkbox-row" htmlFor="pet-info-auto-tag">
            <input
              id="pet-info-auto-tag"
              type="checkbox"
              checked={form.elimination_auto_categorize_by_duration}
              onChange={(event) => setForm((current) => ({
                ...current,
                elimination_auto_categorize_by_duration: event.target.checked,
              }))}
            />
            Auto-tag by duration
          </label>
          {form.elimination_auto_categorize_by_duration && petId && (
            <PetEliminationAutoTagBuckets petId={petId} />
          )}
        </div>
      </div>

      <div className="button-row">
        <button className="button" type="submit" disabled={loading}>
          {loading ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button className="button button-secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
