import { useRef } from 'react';

interface ColorPickerFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function ColorPickerField({ id, value, onChange, placeholder, disabled = false }: ColorPickerFieldProps) {
  const pickerRef = useRef<HTMLInputElement>(null);

  const isValidHex = /^#[0-9a-fA-F]{3,6}$/.test(value);
  const swatchColor = isValidHex ? value : '#94a3b8';

  return (
    <div className="color-picker-field">
      <button
        type="button"
        disabled={disabled}
        className="color-swatch"
        style={{ background: swatchColor }}
        title="Pick colour"
        onClick={() => pickerRef.current?.click()}
        aria-label="Open colour picker"
      />
      <input
        ref={pickerRef}
        type="color"
        disabled={disabled}
        className="color-input-native"
        value={isValidHex ? value : '#94a3b8'}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
      <input
        id={id}
        type="text"
        disabled={disabled}
        className="color-input-text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
      />
    </div>
  );
}
