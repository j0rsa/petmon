import type { HealthStateLevel } from '../../lib/healthState';
import { HEALTH_STATE_OPTIONS } from '../../lib/healthState';

export interface HealthStatePickerProps {
  value: HealthStateLevel | null;
  onChange: (level: HealthStateLevel) => void;
  disabled?: boolean;
  name?: string;
}

export function HealthStatePicker({
  value,
  onChange,
  disabled = false,
  name = 'health-state',
}: HealthStatePickerProps) {
  return (
    <div className="health-state-picker" role="radiogroup" aria-label="Overall health">
      {HEALTH_STATE_OPTIONS.map((option) => {
        const selected = value === option.level;
        return (
          <button
            key={option.level}
            type="button"
            role="radio"
            name={name}
            aria-checked={selected}
            aria-label={option.label}
            disabled={disabled}
            className={[
              'health-state-picker__option',
              selected ? 'health-state-picker__option--selected' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => onChange(option.level)}
          >
            <span className="health-state-picker__emoji" aria-hidden="true">
              {option.emoji}
            </span>
            <span className="health-state-picker__label">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
