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
}

export function FormulationPicker({ color, value, onChange }: FormulationPickerProps) {
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
      <div className="form-row">
        <label style={{ fontSize: '0.82rem' }}>Tablet strength (mg)</label>
        <input
          type="text"
          inputMode="decimal"
          value={value.tabletStrengthMg}
          onChange={(e) => onChange({ ...value, tabletStrengthMg: e.target.value })}
          placeholder="e.g. 5"
        />
      </div>
      <div>
        <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: '0.35rem' }}>Shape</label>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {PILL_SHAPES.map((shape) => (
            <button
              key={shape}
              type="button"
              className={`button${value.pillShape === shape ? '' : ' button-secondary'}`}
              style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem' }}
              onClick={() => onChange({ ...value, pillShape: shape })}
            >
              {pillShapeLabel(shape)}
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
  pillShape: 'round_1_precut',
  doseFraction: 'half',
};
