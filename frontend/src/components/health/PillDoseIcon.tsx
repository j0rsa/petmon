import type { DoseFraction, PillShape } from '../../api/medications';
import {
  doseRegionElement,
  isDoseSupported,
  pillShapeGeometry,
} from '../../lib/pillDoseCuts';
import { doseFractionLabel } from '../../lib/medications';

export interface PillDoseIconProps {
  color: string;
  shape: PillShape;
  fraction: DoseFraction;
  size?: number;
  /** Show human-readable shape name beside the icon. */
  showShapeName?: boolean;
  className?: string;
}

export function PillDoseIcon({
  color,
  shape,
  fraction,
  size = 36,
  showShapeName = false,
  className,
}: PillDoseIconProps) {
  const geo = pillShapeGeometry(shape);
  const stroke = 'color-mix(in srgb, var(--text-strong) 35%, transparent)';
  const supported = isDoseSupported(shape, fraction);
  const dose = doseRegionElement(shape, fraction);
  const clipOutlineId = `pill-outline-${shape}-${size}`;
  const clipDoseId = `pill-dose-${shape}-${fraction}-${size}`;

  const icon = (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <clipPath id={clipOutlineId}>
          <path d={geo.outline} />
        </clipPath>
        <clipPath id={clipDoseId}>
          <path d={geo.outline} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipOutlineId})`}>
        <path d={geo.outline} fill={color} opacity={0.18} />
        {supported && dose.type === 'path' && (
          <g clipPath={`url(#${clipDoseId})`}>
            <path d={dose.d} fill={color} />
          </g>
        )}
      </g>
      <path d={geo.outline} fill="none" stroke={stroke} strokeWidth={1.4} />
      {geo.scoreLines && (
        <path d={geo.scoreLines} fill="none" stroke={stroke} strokeWidth={1.2} />
      )}
    </svg>
  );

  if (!showShapeName) {
    return (
      <span className={className} style={{ display: 'inline-flex', lineHeight: 0 }}>
        {icon}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.65rem', lineHeight: 1.2 }}
    >
      <span style={{ display: 'inline-flex', lineHeight: 0, flexShrink: 0 }}>{icon}</span>
      <span style={{ display: 'grid', gap: '0.1rem' }}>
        <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>{geo.label}</span>
        {!supported && (
          <span className="muted-text" style={{ fontSize: '0.75rem' }}>
            {doseFractionLabel(fraction)} not defined for this shape
          </span>
        )}
      </span>
    </span>
  );
}
