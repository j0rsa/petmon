import type { ReactNode } from 'react';
import type { DoseFraction, PillShape } from '../../api/medications';
import {
  DOSE_FRACTIONS,
  EMPHASIZED_DOSE_FRACTIONS,
  PILL_SHAPES,
  doseFractionLabel,
  pillShapeLabel,
} from '../../lib/medications';
import { isDoseSupported, pillDosePreviewHint, supportedDoseFractions } from '../../lib/pillDoseCuts';
import { PillDoseIcon } from './PillDoseIcon';

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
  showDose?: boolean;
  beforeDose?: ReactNode;
}

export function FormulationPicker({
  color,
  value,
  onChange,
  formulationLocked = false,
  onFormulationLockedChange,
  showDose = true,
  beforeDose,
}: FormulationPickerProps) {
  const tabletFieldsDisabled = formulationLocked;

  const doseHint = pillDosePreviewHint(value.pillShape, value.doseFraction);

  return (
    <div className="formulation-picker" style={{ display: 'grid', gap: '0.75rem' }}>
      <div>
        <PillDoseIcon
          color={color}
          shape={value.pillShape}
          fraction={showDose ? value.doseFraction : 'whole'}
          size={56}
          showShapeName
        />
        {showDose && doseHint && (
          <p className="muted-text" style={{ fontSize: '0.78rem', margin: '0.35rem 0 0' }}>{doseHint}</p>
        )}
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
          className="formulation-picker__shapes"
        >
          {PILL_SHAPES.map((shape) => (
            <button
              key={shape}
              type="button"
              title={pillShapeLabel(shape)}
              className={`button${value.pillShape === shape ? '' : ' button-secondary'}`}
              style={{ padding: '0.25rem', minHeight: '2.6rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onClick={() => {
                const fractions = supportedDoseFractions(shape);
                const doseFraction = isDoseSupported(shape, value.doseFraction)
                  ? value.doseFraction
                  : (fractions.includes('half') ? 'half' : fractions[fractions.length - 1]!);
                onChange({ ...value, pillShape: shape, doseFraction });
              }}
            >
              <PillDoseIcon
                color={color}
                shape={shape}
                fraction="half"
                size={32}
              />
            </button>
          ))}
        </div>
      </div>
      {beforeDose}
      {showDose && <div>
        <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: '0.45rem' }}>Dose per administration</label>
        <div className="formulation-picker__doses">
          {DOSE_FRACTIONS.map((fraction) => {
            const supported = isDoseSupported(value.pillShape, fraction);
            return (
              <button
                key={fraction}
                type="button"
                disabled={!supported}
                title={supported ? undefined : pillDosePreviewHint(value.pillShape, fraction) ?? undefined}
                className={`button${value.doseFraction === fraction ? '' : ' button-secondary'}`}
                style={{
                  padding: '0.45rem 0.35rem',
                  fontSize: '0.95rem',
                  fontWeight: 400,
                  lineHeight: 1.1,
                  fontVariantNumeric: 'tabular-nums',
                  opacity: supported ? 1 : 0.4,
                }}
                onClick={() => onChange({ ...value, doseFraction: fraction })}
              >
                {EMPHASIZED_DOSE_FRACTIONS.has(fraction) ? (
                  <strong style={{ fontWeight: 800 }}>{doseFractionLabel(fraction)}</strong>
                ) : (
                  <span style={{ fontWeight: 400 }}>{doseFractionLabel(fraction)}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>}
    </div>
  );
}
