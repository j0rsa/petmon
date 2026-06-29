import { useRef, useState } from 'react';

export interface TagInputProps {
  /** Currently selected values */
  value: string[];
  /** All available options to suggest */
  options: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function TagInput({ value, options, onChange, placeholder = 'Add…', disabled = false }: TagInputProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const remaining = options.filter((o) => !value.includes(o));
  const filtered = query
    ? remaining.filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    : remaining;

  function add(tag: string) {
    if (!value.includes(tag)) onChange([...value, tag]);
    setQuery('');
    inputRef.current?.focus();
  }

  function remove(tag: string) {
    onChange(value.filter((v) => v !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === 'Tab') && filtered.length > 0) {
      e.preventDefault();
      add(filtered[0]);
    }
    if (e.key === 'Backspace' && query === '' && value.length > 0) {
      remove(value[value.length - 1]);
    }
  }

  return (
    <div
      className="tag-input"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.35rem',
        alignItems: 'center',
        padding: '0.35rem 0.55rem',
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: 'var(--surface)',
        cursor: disabled ? 'not-allowed' : 'text',
        opacity: disabled ? 0.6 : 1,
        minHeight: '2.2rem',
      }}
      onClick={() => !disabled && inputRef.current?.focus()}
    >
      {value.map((tag) => (
        <span
          key={tag}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            background: 'var(--accent)',
            color: 'var(--accent-fg, #fff)',
            borderRadius: 5,
            padding: '0.15rem 0.45rem',
            fontSize: '0.78rem',
            fontFamily: 'monospace',
            fontWeight: 600,
            letterSpacing: '0.02em',
          }}
        >
          {tag}
          {!disabled && (
            <button
              type="button"
              aria-label={`Remove ${tag}`}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'inherit', opacity: 0.7, fontSize: '0.9em' }}
              onClick={(e) => { e.stopPropagation(); remove(tag); }}
            >
              ×
            </button>
          )}
        </span>
      ))}

      {!disabled && remaining.length > 0 && (
        <div style={{ position: 'relative', flex: '1 1 80px', minWidth: 60 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? placeholder : ''}
            style={{
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: '0.82rem',
              width: '100%',
              padding: '0.1rem 0',
            }}
          />
          {(query || filtered.length > 0) && filtered.length > 0 && (
            <ul
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                zIndex: 10,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                margin: '0.25rem 0 0',
                padding: '0.25rem 0',
                listStyle: 'none',
                minWidth: 140,
                boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
              }}
            >
              {filtered.map((opt) => (
                <li
                  key={opt}
                  onMouseDown={(e) => { e.preventDefault(); add(opt); }}
                  style={{
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.82rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    color: 'var(--text)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-raised)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '')}
                >
                  {opt}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
