import type { ReactNode } from 'react';

export type TrendDir = 'up' | 'down' | 'flat';

const TREND_THRESHOLD = 0.05;

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
  /** Pre-formatted display string (e.g. "4.2", "1m 35s"). */
  value: string;
  color?: string;
  unit?: string;
  icon?: ReactNode;
  /**
   * Numeric current value. When paired with `avg`, the component derives the
   * trend arrow and deviation note from the same ±5% dead-band, so they
   * always agree. Omit both to show no trend.
   */
  current?: number;
  avg?: number;
  /** Optional reference label appended to the note (e.g. "avg 4.1"). */
  avgLabel?: string;
  /** Overrides the auto-computed note — use for context like "14% of period". */
  note?: string;
}

function deriveTrend(current: number, avg: number): { dir: TrendDir; notePct: string } {
  if (avg <= 0) return { dir: 'flat', notePct: '' };
  const pct = (current - avg) / avg;
  const pctRounded = Math.round(pct * 100);
  const sign = pctRounded > 0 ? '+' : '';
  if (pct > TREND_THRESHOLD)  return { dir: 'up',   notePct: `${sign}${pctRounded}%` };
  if (pct < -TREND_THRESHOLD) return { dir: 'down', notePct: `${sign}${pctRounded}%` };
  return { dir: 'flat', notePct: '' };
}

export function StatCard({
  label,
  value,
  color = 'var(--accent)',
  unit,
  icon,
  current,
  avg,
  avgLabel,
  note,
}: StatCardProps) {
  const hasTrend = current !== undefined && avg !== undefined;
  const derived = hasTrend ? deriveTrend(current, avg) : null;

  const autoNote = derived
    ? derived.notePct
      ? `${derived.notePct} vs ${avgLabel ?? `avg ${avg!.toFixed(1)}`}`
      : `stable · ${avgLabel ?? `avg ${avg!.toFixed(1)}`}`
    : null;

  const displayNote = note ?? autoNote;

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
        {derived && <TrendArrow dir={derived.dir} />}
      </div>
      {displayNote && (
        <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', marginTop: '0.1rem' }}>{displayNote}</span>
      )}
    </div>
  );
}
