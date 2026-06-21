interface TimeInputProps {
  value: string;
  onChange: (time: string) => void;
  autoFocus?: boolean;
  'aria-label'?: string;
}

export function TimeInput({
  value,
  onChange,
  autoFocus,
  'aria-label': ariaLabel = 'Time',
}: TimeInputProps) {
  return (
    <input
      className="entry-inline-input entry-inline-time"
      type="time"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoFocus={autoFocus}
    />
  );
}
