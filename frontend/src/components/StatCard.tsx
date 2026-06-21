import type { ReactNode } from 'react';

export type TrendDir = 'up' | 'down' | 'flat';

export function TrendArrow({ dir }: { dir: TrendDir }) {
  const map: Record<TrendDir, { symbol: string; color: string }> = {
    up:   { symbol: '▲', color: 'var(--error-text)' },
    down: { symbol: '▼', color: 'var(--metric-water)' },
    flat: { symbol: '●', color: 'var(--text-muted)' },
  };
  const { symbol, color } = map[dir];
  return <span style={{ fontSize: '1rem', color, lineHeight: 1 }}>{symbol}</span>;
}

interface StatCardProps {
  label: string;
  value: string;
  color?: string;
  trend?: TrendDir | null;
  /** Small unit suffix rendered after the value (e.g. "ml", "g"). */
  unit?: string;
  /** Secondary line shown below the value — use for deviation % or context notes. */
  note?: string;
  /** Icon rendered as a dim watermark in the bottom-right corner. */
  icon?: ReactNode;
}

export function StatCard({
  label,
  value,
  color = 'var(--accent)',
  trend,
  unit,
  note,
  icon,
}: StatCardProps) {
  return (
    <div className="stat-card" style={{ position: 'relative', overflow: 'hidden' }}>
      {icon && (
        <div style={{
          position: 'absolute',
          right: '0.75rem',
          bottom: '0.5rem',
          width: 52,
          height: 52,
          color,
          opacity: 0.08,
          pointerEvents: 'none',
        }}>
          {icon}
        </div>
      )}
      <span className="metric-label">{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <strong style={{ color, fontFamily: 'monospace', fontSize: '2rem' }}>
          {value}
          {unit && <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginLeft: '0.2rem' }}>{unit}</span>}
        </strong>
        {trend && <TrendArrow dir={trend} />}
      </div>
      {note && (
        <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: '0.1rem' }}>{note}</span>
      )}
    </div>
  );
}
