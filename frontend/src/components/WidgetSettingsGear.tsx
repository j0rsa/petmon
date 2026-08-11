import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Settings } from 'lucide-react';

interface WidgetSettingsGearProps {
  label: string;
  children: ReactNode;
}

export function WidgetSettingsGear({ label, children }: WidgetSettingsGearProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className="widget-settings-gear" ref={rootRef}>
      <button
        type="button"
        className="button button-secondary button-compact widget-settings-gear-btn"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <Settings size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="widget-settings-popover" role="dialog" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}

interface WidgetSettingsFieldProps {
  label: string;
  children: ReactNode;
}

export function WidgetSettingsField({ label, children }: WidgetSettingsFieldProps) {
  return (
    <div className="widget-settings-field">
      <span className="widget-settings-field-label">{label}</span>
      <div className="widget-settings-field-control">{children}</div>
    </div>
  );
}

interface WidgetSettingsCheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function WidgetSettingsCheckbox({ label, checked, onChange }: WidgetSettingsCheckboxProps) {
  return (
    <label className="checkbox-row widget-settings-checkbox">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

interface WidgetSettingsRadioGroupProps<T extends string> {
  name: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}

export function WidgetSettingsRadioGroup<T extends string>({ name, value, options, onChange }: WidgetSettingsRadioGroupProps<T>) {
  return (
    <div className="widget-settings-radio-group">
      {options.map((option) => (
        <label key={option.value} className="checkbox-row widget-settings-checkbox">
          <input
            type="radio"
            name={name}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}
