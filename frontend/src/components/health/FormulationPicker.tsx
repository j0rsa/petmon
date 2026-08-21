import type { DoseFraction, PillShape } from '../../api/medications';
import { DOSE_FRACTIONS, PILL_SHAPES, doseFractionLabel, pillShapeLabel } from '../../lib/medications';
import { MedIcon } from './MedIcon';

export interface FormulationPickerValue {
  tabletStrengthMg: string;
  pillShape: PillShape;
  doseFraction: DoseFraction;
}

interface FormulationPickerProps {
  color: string;
  value: FormulationPickerValue;
  onChange: (value: FormulationPickerValue) => void;
  /** When revising: tablet strength/shape locked until user opts in. */
  formulationLocked?: boolean;
  onFormulationLockedChange?: (locked: boolean) => void;
}

export function FormulationPicker({
  color,
  value,
  onChange,
  formulationLocked = false,
  onFormulationLockedChange,
}: FormulationPickerProps) {
  const tabletFieldsDisabled = formulationLocked;

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <MedIcon
          medType="pill"
          color={color}
          pillShape={value.pillShape}
          doseFraction={value.doseFraction}
          size={56}
        />
        <div className="muted-text" style={{ fontSize: '0.82rem' }}>Preview</div>
      </div>

      {onFormulationLockedChange && (
        <div style={{ fontSize: '0.82rem' }}>
          {formulationLocked ? (
            <p className="muted-text" style={{ margin: 0 }}>
              Keeping the same tablet.{' '}
              <button
                type="button"
                style={{ fontSize: 'inherit', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                onClick={() => onFormulationLockedChange(false)}
              >
                Switch tablet strength or shape
              </button>
            </p>
          ) : (
            <p className="muted-text" style={{ margin: 0 }}>
              Changing tablet strength or shape — a new formulation will be recorded.{' '}
              <button
                type="button"
                style={{ fontSize: 'inherit', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                onClick={() => onFormulationLockedChange(true)}
              >
                Keep current tablet
              </button>
            </p>
          )}
        </div>
      )}

      <div className="form-row">
        <label style={{ fontSize: '0.82rem' }}>Tablet strength (mg)</label>
        <input
          type="text"
          inputMode="decimal"
          value={value.tabletStrengthMg}
          disabled={tabletFieldsDisabled}
          onChange={(e) => onChange({ ...value, tabletStrengthMg: e.target.value })}
          placeholder="e.g. 5"
        />
      </div>
      <div style={tabletFieldsDisabled ? { opacity: 0.55, pointerEvents: 'none' } : undefined}>
        <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: '0.35rem' }}>Shape</label>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(3.2rem, 1fr))',
            gap: '0.35rem',
            maxWidth: '28rem',
          }}
        >
          {PILL_SHAPES.map((shape) => (
            <button
              key={shape}
              type="button"
              title={pillShapeLabel(shape)}
              className={`button${value.pillShape === shape ? '' : ' button-secondary'}`}
              style={{ padding: '0.25rem', minHeight: '2.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => onChange({ ...value, pillShape: shape })}
            >
              <MedIcon medType="pill" color={color} pillShape={shape} doseFraction="half" size={32} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: '0.35rem' }}>Dose per administration</label>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {DOSE_FRACTIONS.map((fraction) => (
            <button
              key={fraction}
              type="button"
              className={`button${value.doseFraction === fraction ? '' : ' button-secondary'}`}
              style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', minWidth: '2.5rem' }}
              onClick={() => onChange({ ...value, doseFraction: fraction })}
            >
              {doseFractionLabel(fraction)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const defaultFormulationPickerValue: FormulationPickerValue = {
  tabletStrengthMg: '5',
  pillShape: 'round',
  doseFraction: 'half',
};
