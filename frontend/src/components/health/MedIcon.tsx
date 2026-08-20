import type { MedType, DoseFraction, PillShape } from '../../api/medications';
import { fractionAngle } from '../../lib/medications';

export interface MedIconProps {
  medType: MedType;
  color: string;
  pillShape?: PillShape | null;
  doseFraction?: DoseFraction | null;
  size?: number;
  className?: string;
}

function wedgePath(cx: number, cy: number, r: number, angleDeg: number): string {
  if (angleDeg >= 360) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
  }
  const start = -Math.PI / 2;
  const end = start + (angleDeg * Math.PI) / 180;
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const largeArc = angleDeg > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function PillIcon({
  color,
  shape,
  fraction,
  size,
}: {
  color: string;
  shape: PillShape;
  fraction: DoseFraction;
  size: number;
}) {
  const angle = fractionAngle(fraction);
  const stroke = 'color-mix(in srgb, var(--text-strong) 35%, transparent)';

  if (shape === 'ellipse_1_precut') {
    const cx = size / 2;
    const cy = size / 2;
    const rx = size * 0.38;
    const ry = size * 0.22;
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={color} opacity={0.25} />
        <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke={stroke} strokeWidth={1.2} />
        <line x1={cx - rx} y1={cy} x2={cx + rx} y2={cy} stroke={stroke} strokeWidth={1.2} />
        <path d={wedgePath(cx, cy, rx, angle)} fill={color} />
      </svg>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.34;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={cx} cy={cy} r={r} fill={color} opacity={0.25} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={stroke} strokeWidth={1.2} />
      <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke={stroke} strokeWidth={1.2} />
      {shape === 'round_2_precut' && (
        <line x1={cx - r} y1={cy} x2={cx + r} y2={cy} stroke={stroke} strokeWidth={1.2} />
      )}
      <path d={wedgePath(cx, cy, r, angle)} fill={color} />
    </svg>
  );
}

function LiquidIcon({ color, size }: { color: string; size: number }) {
  const w = size * 0.5;
  const h = size * 0.72;
  const x = (size - w) / 2;
  const y = size * 0.12;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <rect x={x + w * 0.35} y={y - size * 0.08} width={w * 0.3} height={size * 0.12} rx={2} fill={color} />
      <path
        d={`M ${x + w * 0.15} ${y} L ${x + w * 0.85} ${y} L ${x + w * 0.78} ${y + h} L ${x + w * 0.22} ${y + h} Z`}
        fill={color}
        opacity={0.85}
      />
      <rect x={x + w * 0.22} y={y + h * 0.35} width={w * 0.12} height={h * 0.45} rx={1} fill="white" opacity={0.35} />
    </svg>
  );
}

export function MedIcon({
  medType,
  color,
  pillShape,
  doseFraction,
  size = 36,
  className,
}: MedIconProps) {
  if (medType === 'liquid') {
    return (
      <span className={className} style={{ display: 'inline-flex', lineHeight: 0 }}>
        <LiquidIcon color={color} size={size} />
      </span>
    );
  }

  const shape = pillShape ?? 'round_1_precut';
  const fraction = doseFraction ?? 'half';

  return (
    <span className={className} style={{ display: 'inline-flex', lineHeight: 0 }}>
      <PillIcon color={color} shape={shape} fraction={fraction} size={size} />
    </span>
  );
}
