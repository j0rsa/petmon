import type { CSSProperties } from 'react';
import type { MedBundle } from '../../api/medications';
import { MedIcon } from './MedIcon';

interface BundleCardProps {
  bundle: MedBundle;
  canWrite: boolean;
  deleting: boolean;
  onDelete: () => void;
}

export function BundleCard({ bundle, canWrite, deleting, onDelete }: BundleCardProps) {
  const accent = bundle.items[0]?.medication.color ?? 'var(--accent)';

  return (
    <article
      className="plan-entity"
      style={{ '--plan-entity-accent': accent } as CSSProperties}
    >
      <div className="plan-entity__header">
        <div className="plan-entity__icons" aria-hidden="true">
          {bundle.items.map((item) => (
            <MedIcon
              key={item.medication_id}
              medType={item.medication.med_type}
              color={item.medication.color}
              pillShape="round"
              doseFraction="whole"
              size={32}
            />
          ))}
        </div>
        <div className="plan-entity__identity">
          <div className="plan-entity__name-row">
            <h4 className="plan-entity__name">{bundle.name}</h4>
          </div>
          <p className="plan-entity__dose">
            {bundle.items
              .map((item) => `${item.medication.emoji ?? '💊'} ${item.medication.name}`)
              .join(' + ')}
          </p>
        </div>
        {canWrite && (
          <div className="plan-entity__actions">
            <button
              type="button"
              className="button button-danger button-compact"
              disabled={deleting}
              aria-label={`Delete bundle ${bundle.name}`}
              onClick={onDelete}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
