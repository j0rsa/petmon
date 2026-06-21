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
}

export function StatCard({ label, value, color = 'var(--accent)', trend }: StatCardProps) {
  return (
    <div className="stat-card">
      <span className="metric-label">{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <strong style={{ color, fontFamily: 'monospace', fontSize: '2rem' }}>
          {value}
        </strong>
        {trend && <TrendArrow dir={trend} />}
      </div>
    </div>
  );
}
