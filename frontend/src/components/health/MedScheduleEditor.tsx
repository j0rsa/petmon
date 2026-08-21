import type { MedFrequency } from '../../api/medications';

interface MedScheduleEditorProps {
  value: MedFrequency;
  onChange: (value: MedFrequency) => void;
}

type PartOfDay = 'morning' | 'midday' | 'evening';

const PARTS: { key: PartOfDay; label: string }[] = [
  { key: 'morning', label: 'Morning' },
  { key: 'midday', label: 'Midday' },
  { key: 'evening', label: 'Evening' },
];

export function MedScheduleEditor({ value, onChange }: MedScheduleEditorProps) {
  function setPart(key: PartOfDay, count: number) {
    onChange({ ...value, [key]: Math.max(0, Math.min(9, count)) });
  }

  return (
    <div style={{ display: 'grid', gap: '0.8rem' }}>
      <div>
        <label style={{ display: 'block', fontSize: '0.82rem', marginBottom: '0.45rem' }}>
          Doses by part of day
        </label>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          {PARTS.map(({ key, label }) => (
            <div
              key={key}
              style={{
                display: 'grid',
                gap: '0.3rem',
                justifyItems: 'center',
                padding: '0.55rem',
                border: '1px solid var(--border-subtle)',
                borderRadius: 8,
              }}
            >
              <span style={{ fontSize: '0.78rem' }}>{label}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <button
                  type="button"
                  className="button button-secondary"
                  aria-label={`Decrease ${label.toLowerCase()} doses`}
                  disabled={value[key] === 0}
                  style={{ width: '2rem', height: '2rem', padding: 0 }}
                  onClick={() => setPart(key, value[key] - 1)}
                >
                  −
                </button>
                <output
                  aria-label={`${label} dose count`}
                  style={{ minWidth: '1.5rem', textAlign: 'center', fontWeight: 700 }}
                >
                  {value[key]}
                </output>
                <button
                  type="button"
                  className="button button-secondary"
                  aria-label={`Increase ${label.toLowerCase()} doses`}
                  style={{ width: '2rem', height: '2rem', padding: 0 }}
                  onClick={() => setPart(key, value[key] + 1)}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'end', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div className="form-row" style={{ width: '7rem' }}>
          <label style={{ fontSize: '0.82rem' }}>Every</label>
          <input
            type="number"
            min={1}
            max={365}
            value={value.every}
            onChange={(event) => {
              const every = Number.parseInt(event.target.value, 10);
              onChange({ ...value, every: Number.isFinite(every) ? Math.max(1, every) : 1 });
            }}
          />
        </div>
        <div className="form-row" style={{ width: '9rem' }}>
          <label style={{ fontSize: '0.82rem' }}>Interval</label>
          <select
            value={value.unit}
            onChange={(event) => onChange({ ...value, unit: event.target.value as MedFrequency['unit'] })}
          >
            <option value="days">Days</option>
            <option value="weeks">Weeks</option>
          </select>
        </div>
      </div>
    </div>
  );
}
