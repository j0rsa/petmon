import type { DoseFraction, PillShape } from '../api/medications';
import { doseFractionLabel } from './medications';

export type ScorePattern = 'vertical' | 'horizontal' | 'cross' | 'none';

export interface PillShapeGeometry {
  id: PillShape;
  label: string;
  outline: string;
  scorePattern: ScorePattern;
  /** Score lines drawn on the pill (may be empty). */
  scoreLines: string;
  supportedFractions: readonly DoseFraction[];
}

/**
 * Pill outlines and score patterns follow the reference chart.
 * Dose regions are derived from score lines — never proportional slices
 * unless the score grid clearly defines the piece.
 */
export const PILL_SHAPE_GEOMETRY: PillShapeGeometry[] = [
  {
    id: 'freedom',
    label: 'Freedom',
    outline: 'M 20 50 C 20 32 36 28 50 50 C 64 28 80 32 80 50 C 80 68 64 72 50 50 C 36 72 20 68 20 50 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 28 L 50 72',
    supportedFractions: ['whole', 'half'],
  },
  {
    id: 'oval',
    label: 'Oval',
    outline: 'M 14 50 A 36 20 0 1 1 86 50 A 36 20 0 1 1 14 50 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 30 L 50 70',
    supportedFractions: ['whole', 'half'],
  },
  {
    id: 'square',
    label: 'Square',
    outline: 'M 28 24 H 72 A 8 8 0 0 1 80 32 V 68 A 8 8 0 0 1 72 76 H 28 A 8 8 0 0 1 20 68 V 32 A 8 8 0 0 1 28 24 Z',
    scorePattern: 'cross',
    scoreLines: 'M 50 24 L 50 76 M 20 50 L 80 50',
    supportedFractions: ['whole', 'half', 'quarter', 'three_quarter', 'eighth', 'sixteenth'],
  },
  {
    id: 'capsule',
    label: 'Capsule',
    outline: 'M 38 22 H 62 A 18 18 0 0 1 62 78 H 38 A 18 18 0 0 1 38 22 Z',
    scorePattern: 'none',
    scoreLines: '',
    supportedFractions: ['whole'],
  },
  {
    id: 'pentagon',
    label: 'Pentagon',
    outline: 'M 50 18 L 78 38 L 68 78 L 32 78 L 22 38 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 18 L 50 78',
    supportedFractions: ['whole', 'half'],
  },
  {
    id: 'tear',
    label: 'Tear',
    outline: 'M 50 18 C 68 34 72 58 50 82 C 28 58 32 34 50 18 Z',
    scorePattern: 'none',
    scoreLines: '',
    supportedFractions: ['whole'],
  },
  {
    id: 'rectangle',
    label: 'Rectangle',
    outline: 'M 22 30 H 78 A 6 6 0 0 1 84 36 V 64 A 6 6 0 0 1 78 70 H 22 A 6 6 0 0 1 16 64 V 36 A 6 6 0 0 1 22 30 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 30 L 50 70',
    supportedFractions: ['whole', 'half'],
  },
  {
    id: 'hexagon',
    label: 'Hexagon',
    outline: 'M 50 18 L 76 34 L 76 66 L 50 82 L 24 66 L 24 34 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 18 L 50 82',
    supportedFractions: ['whole', 'half'],
  },
  {
    id: 'round',
    label: 'Round',
    outline: 'M 50 18 A 32 32 0 1 1 49.9 18 Z',
    scorePattern: 'cross',
    scoreLines: 'M 50 18 L 50 82 M 18 50 L 82 50',
    supportedFractions: ['whole', 'half', 'quarter', 'three_quarter'],
  },
  {
    id: 'triangle',
    label: 'Triangle',
    outline: 'M 50 20 L 78 78 H 22 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 20 L 50 78',
    supportedFractions: ['whole', 'half'],
  },
  {
    id: 'double_circle',
    label: 'Double circle',
    outline: 'M 34 50 A 16 16 0 1 1 34 49.9 L 66 49.9 A 16 16 0 1 1 66 50 Z',
    scorePattern: 'horizontal',
    scoreLines: 'M 18 50 L 82 50',
    supportedFractions: ['whole', 'half'],
  },
  {
    id: 'trapezoid',
    label: 'Trapezoid',
    outline: 'M 30 28 H 70 L 78 72 H 22 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 28 L 50 72',
    // Thirds need the triangular score pattern from the chart — undefined for now.
    supportedFractions: ['whole', 'half'],
  },
  {
    id: 'octagon',
    label: 'Octagon',
    outline: 'M 34 18 H 66 L 82 34 V 66 L 66 82 H 34 L 18 66 V 34 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 18 L 50 82',
    supportedFractions: ['whole', 'half'],
  },
  {
    id: 'diamond',
    label: 'Diamond',
    outline: 'M 50 18 L 78 50 L 50 82 L 22 50 Z',
    scorePattern: 'cross',
    scoreLines: 'M 50 18 L 50 82 M 22 50 L 78 50',
    supportedFractions: ['whole', 'half', 'quarter', 'three_quarter'],
  },
];

export function pillShapeGeometry(shape: PillShape): PillShapeGeometry {
  return PILL_SHAPE_GEOMETRY.find((s) => s.id === shape)
    ?? PILL_SHAPE_GEOMETRY.find((s) => s.id === 'round')!;
}

export function isDoseSupported(shape: PillShape, fraction: DoseFraction): boolean {
  return pillShapeGeometry(shape).supportedFractions.includes(fraction);
}

export function supportedDoseFractions(shape: PillShape): DoseFraction[] {
  return [...pillShapeGeometry(shape).supportedFractions];
}

/** Rectangular dose piece before clipping to pill outline (viewBox 0 0 100 100). */
function doseRect(fraction: DoseFraction, pattern: ScorePattern): { x: number; y: number; w: number; h: number } | null {
  if (fraction === 'whole') {
    return { x: 0, y: 0, w: 100, h: 100 };
  }

  if (pattern === 'vertical') {
    if (fraction === 'half') return { x: 0, y: 0, w: 50, h: 100 };
    return null;
  }

  if (pattern === 'horizontal') {
    if (fraction === 'half') return { x: 0, y: 0, w: 100, h: 50 };
    return null;
  }

  if (pattern === 'cross') {
    switch (fraction) {
      case 'half':
        return { x: 0, y: 0, w: 50, h: 100 };
      case 'quarter':
        return { x: 0, y: 0, w: 50, h: 50 };
      case 'three_quarter':
        return { x: 0, y: 0, w: 100, h: 100 }; // handled as compound below
      case 'eighth':
        return { x: 0, y: 0, w: 50, h: 25 };
      case 'sixteenth':
        return { x: 0, y: 0, w: 25, h: 25 };
      default:
        return null;
    }
  }

  return null;
}

/**
 * SVG path for the dose region clipped conceptually to the pill.
 * Returns null when the shape/fraction combination is not defined.
 */
export function doseRegionPath(shape: PillShape, fraction: DoseFraction): string | null {
  const geo = pillShapeGeometry(shape);
  if (!geo.supportedFractions.includes(fraction)) {
    return null;
  }

  if (fraction === 'whole') {
    return geo.outline;
  }

  if (geo.scorePattern === 'cross' && fraction === 'three_quarter') {
    // All quadrants except bottom-right.
    return 'M 0 0 H 100 V 50 H 50 V 100 H 0 Z';
  }

  const rect = doseRect(fraction, geo.scorePattern);
  if (!rect) return null;

  const { x, y, w, h } = rect;
  return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
}

export function doseRegionElement(
  shape: PillShape,
  fraction: DoseFraction,
): { type: 'path'; d: string } | { type: 'none' } {
  const d = doseRegionPath(shape, fraction);
  if (!d) return { type: 'none' };
  return { type: 'path', d };
}

export function pillDosePreviewHint(shape: PillShape, fraction: DoseFraction): string | null {
  if (isDoseSupported(shape, fraction)) return null;
  if (fraction === 'whole') return null;
  const label = pillShapeGeometry(shape).label;
  return `${doseFractionLabel(fraction)} is not defined for ${label} — specify cut pattern or choose another dose.`;
}
