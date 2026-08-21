import type { MedType, DoseFraction, PillShape } from '../../api/medications';
import { pillFractionFill, pillShapeDef } from '../../lib/pillShapes';

export interface MedIconProps {
  medType: MedType;
  color: string;
  pillShape?: PillShape | null;
  doseFraction?: DoseFraction | null;
  size?: number;
  className?: string;
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
  const def = pillShapeDef(shape);
  const stroke = 'color-mix(in srgb, var(--text-strong) 35%, transparent)';
  const clipId = `pill-clip-${shape}-${fraction}-${size}`;
  const fill = pillFractionFill(def.fillMode, fraction);

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <clipPath id={clipId}>
          <path d={def.path} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <path d={def.path} fill={color} opacity={0.2} />
        {fill.element === 'path' ? (
          <path d={fill.d} fill={color} />
        ) : (
          <rect
            x={fill.rect!.x}
            y={fill.rect!.y}
            width={fill.rect!.w}
            height={fill.rect!.h}
            fill={color}
          />
        )}
      </g>
      <path d={def.path} fill="none" stroke={stroke} strokeWidth={1.4} />
      <path d={def.scoreLines} fill="none" stroke={stroke} strokeWidth={1.2} />
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

  const shape = pillShape ?? 'round';
  const fraction = doseFraction ?? 'half';

  return (
    <span className={className} style={{ display: 'inline-flex', lineHeight: 0 }}>
      <PillIcon color={color} shape={shape} fraction={fraction} size={size} />
    </span>
  );
}
