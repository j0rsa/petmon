interface TimeInputProps {
  value: string;
  onChange: (time: string) => void;
  autoFocus?: boolean;
  'aria-label'?: string;
  /** `form` matches full-width record entry fields; `inline` is for compact row editing. */
  variant?: 'inline' | 'form';
}

export function TimeInput({
  value,
  onChange,
  autoFocus,
  'aria-label': ariaLabel = 'Time',
  variant = 'inline',
}: TimeInputProps) {
  const className =
    variant === 'form' ? 'record-entry-time' : 'entry-inline-input entry-inline-time';

  return (
    <input
      className={className}
      type="time"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
    />
  );
}
