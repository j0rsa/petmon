import type { MedType, DoseFraction, PillShape } from '../../api/medications';
import { PillDoseIcon } from './PillDoseIcon';

export interface MedIconProps {
  medType: MedType;
  color: string;
  pillShape?: PillShape | null;
  doseFraction?: DoseFraction | null;
  size?: number;
  showShapeName?: boolean;
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

export function MedIcon({
  medType,
  color,
  pillShape,
  doseFraction,
  size = 36,
  showShapeName = false,
  className,
}: MedIconProps) {
  if (medType === 'liquid') {
    return (
      <span className={className} style={{ display: 'inline-flex', lineHeight: 0 }}>
        <LiquidIcon color={color} size={size} />
      </span>
    );
  }

  return (
    <PillDoseIcon
      color={color}
      shape={pillShape ?? 'round'}
      fraction={doseFraction ?? 'half'}
      size={size}
      showShapeName={showShapeName}
      className={className}
    />
  );
}
