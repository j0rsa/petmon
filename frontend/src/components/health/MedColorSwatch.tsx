import { useEffect, useRef, useState } from 'react';
import { MED_COLOR_PALETTE } from '../../lib/medications';

interface MedColorSwatchProps {
  color: string;
  onChange: (color: string) => void;
  size?: number;
  title?: string;
}

export function MedColorSwatch({ color, onChange, size = 28, title = 'Choose color' }: MedColorSwatchProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          border: '1px solid color-mix(in srgb, var(--text-strong) 25%, transparent)',
          background: color,
          cursor: 'pointer',
          padding: 0,
        }}
      />
      {open && (
        <div
          role="listbox"
          aria-label="Medication colors"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 6,
            zIndex: 20,
            display: 'grid',
            gridTemplateColumns: 'repeat(6, 1.4rem)',
            gap: 4,
            padding: 8,
            borderRadius: 8,
            background: 'var(--surface-raised)',
            border: '1px solid var(--border-subtle)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
          }}
        >
          {MED_COLOR_PALETTE.map((swatch) => (
            <button
              key={swatch}
              type="button"
              role="option"
              aria-selected={swatch === color}
              title={swatch}
              onClick={() => {
                onChange(swatch);
                setOpen(false);
              }}
              style={{
                width: '1.4rem',
                height: '1.4rem',
                borderRadius: 4,
                border: swatch === color
                  ? '2px solid var(--text-strong)'
                  : '1px solid color-mix(in srgb, var(--text-strong) 20%, transparent)',
                background: swatch,
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
