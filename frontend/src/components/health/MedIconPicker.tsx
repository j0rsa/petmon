import type { MedType, PillFraction, PillShape } from '../../api/medications';
import { MED_COLORS, PILL_FRACTIONS, PILL_SHAPES, medTypeLabel, pillFractionLabel, pillShapeLabel } from '../../lib/medications';
import { MedIcon } from './MedIcon';

export interface MedIconPickerValue {
  medType: MedType;
  pillShape: PillShape;
  pillFraction: PillFraction;
  color: string;
}

interface MedIconPickerProps {
  value: MedIconPickerValue;
  onChange: (value: MedIconPickerValue) => void;
}

export function MedIconPicker({ value, onChange }: MedIconPickerProps) {
  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {(['pill', 'liquid'] as MedType[]).map((type) => (
          <button
            key={type}
            type="button"
            className={`button${value.medType === type ? '' : ' button-secondary'}`}
            style={{ padding: '0.35rem 0.85rem', fontSize: '0.82rem' }}
            onClick={() => onChange({ ...value, medType: type })}
          >
            {medTypeLabel(type)}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <MedIcon
          medType={value.medType}
          color={value.color}
          pillShape={value.pillShape}
          pillFraction={value.pillFraction}
          size={56}
        />
        <div className="muted-text" style={{ fontSize: '0.82rem' }}>
          Preview
        </div>
      </div>

      {value.medType === 'pill' && (
        <>
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
            <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: '0.35rem' }}>Dose fraction</label>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {PILL_FRACTIONS.map((fraction) => (
                <button
                  key={fraction}
                  type="button"
                  className={`button${value.pillFraction === fraction ? '' : ' button-secondary'}`}
                  style={{ padding: '0.3rem 0.65rem', fontSize: '0.78rem', minWidth: '2.5rem' }}
                  onClick={() => onChange({ ...value, pillFraction: fraction })}
                >
                  {pillFractionLabel(fraction)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <div>
        <label style={{ fontSize: '0.82rem', display: 'block', marginBottom: '0.35rem' }}>Color</label>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {MED_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Color ${color}`}
              onClick={() => onChange({ ...value, color })}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                border: value.color === color ? '2px solid var(--text-strong)' : '2px solid transparent',
                background: color,
                cursor: 'pointer',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export const defaultMedIconPickerValue: MedIconPickerValue = {
  medType: 'pill',
  pillShape: 'round_1_precut',
  pillFraction: 'half',
  color: MED_COLORS[0],
};
