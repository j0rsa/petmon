import { useState, type CSSProperties } from 'react';
import type { Medication, UpdateMedication } from '../../api/medications';
import { medTypeLabel } from '../../lib/medications';
import { MedColorSwatch } from './MedColorSwatch';
import { MedIcon } from './MedIcon';

interface KnownMedicationCardProps {
  medication: Medication;
  canWrite: boolean;
  canAssign: boolean;
  editing: boolean;
  saving: boolean;
  deleting: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: UpdateMedication) => void;
  onAssign: () => void;
  onDelete: () => void;
}

function KnownMedicationEditor({
  medication,
  saving,
  onCancelEdit,
  onSave,
}: Pick<KnownMedicationCardProps, 'medication' | 'saving' | 'onCancelEdit' | 'onSave'>) {
  const [name, setName] = useState(medication.name);
  const [color, setColor] = useState(medication.color);
  const [emoji, setEmoji] = useState(medication.emoji ?? '');
  const [description, setDescription] = useState(medication.description ?? '');

  return (
    <>
      <div className="plan-entity__header">
        <MedIcon
          medType={medication.med_type}
          color={color}
          pillShape="round"
          doseFraction="whole"
          size={36}
        />
        <div className="plan-entity__identity">
          <label className="form-row">
            <span>Name</span>
            <input
              aria-label={`Name for ${medication.name}`}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        </div>
      </div>
      <div className="plan-entity__edit-fields">
        <div className="plan-entity__edit-field">
          <span className="plan-entity__label">Color</span>
          <MedColorSwatch
            color={color}
            onChange={setColor}
            title={`Change color for ${medication.name}`}
          />
        </div>
        <label className="plan-entity__edit-field">
          <span className="plan-entity__label">Emoji</span>
          <input
            aria-label={`Telegram emoji for ${medication.name}`}
            type="text"
            value={emoji}
            onChange={(event) => setEmoji(event.target.value)}
            placeholder="💊"
            style={{ width: '4rem', textAlign: 'center' }}
          />
        </label>
        <span className="status-pill">{medTypeLabel(medication.med_type)}</span>
      </div>
      <label className="plan-entity__edit-field" style={{ gridColumn: '1 / -1' }}>
        <span className="plan-entity__label">Description</span>
        <textarea
          aria-label={`Description for ${medication.name}`}
          value={description}
          rows={2}
          placeholder="Optional notes (e.g. purpose, storage, side effects)"
          style={{ resize: 'vertical', minHeight: '3.5rem' }}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <div className="button-row">
        <button
          type="button"
          className="button button-compact"
          disabled={!name.trim() || saving}
          onClick={() => onSave({
            name: name.trim(),
            color,
            emoji: emoji.trim(),
            description: description.trim(),
          })}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="button button-secondary button-compact" onClick={onCancelEdit}>
          Cancel
        </button>
      </div>
    </>
  );
}

export function KnownMedicationCard({
  medication,
  canWrite,
  canAssign,
  editing,
  saving,
  deleting,
  onEdit,
  onCancelEdit,
  onSave,
  onAssign,
  onDelete,
}: KnownMedicationCardProps) {
  return (
    <article
      className={`plan-entity${editing ? ' plan-entity--editing' : ''}`}
      style={{ '--plan-entity-accent': medication.color } as CSSProperties}
    >
      {editing ? (
        <KnownMedicationEditor
          medication={medication}
          saving={saving}
          onCancelEdit={onCancelEdit}
          onSave={onSave}
        />
      ) : (
        <>
          <div className="plan-entity__header">
            <MedIcon
              medType={medication.med_type}
              color={medication.color}
              pillShape="round"
              doseFraction="whole"
              size={36}
            />
            <div className="plan-entity__identity">
              <div className="plan-entity__name-row">
                <h4 className="plan-entity__name">{medication.name}</h4>
                <span className="plan-entity__emoji" aria-label={`Telegram emoji ${medication.emoji ?? '💊'}`}>
                  {medication.emoji ?? '💊'}
                </span>
              </div>
              {medication.description && (
                <p className="muted-text" style={{ fontSize: '0.82rem', margin: '0.2rem 0 0' }}>
                  {medication.description}
                </p>
              )}
            </div>
            {canWrite && (
              <div className="plan-entity__actions">
                <button
                  type="button"
                  className="button button-secondary button-compact"
                  aria-label={`Edit ${medication.name}`}
                  onClick={onEdit}
                >
                  Edit
                </button>
                {canAssign && (
                  <button type="button" className="button button-compact" onClick={onAssign}>
                    Assign
                  </button>
                )}
                <button
                  type="button"
                  className="button button-danger button-compact"
                  disabled={deleting}
                  aria-label={`Delete ${medication.name}`}
                  onClick={onDelete}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </article>
  );
}
