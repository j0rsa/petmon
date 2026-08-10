import { useEffect, useRef, useState, type ReactNode } from 'react';

interface WidgetSettingsGearProps {
  label: string;
  children: ReactNode;
}

function GearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
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
        <GearIcon />
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
