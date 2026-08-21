import type { DoseFraction, PillShape } from '../api/medications';
import { doseFractionLabel, fractionAngle } from './medications';

export type ScorePattern = 'vertical' | 'horizontal' | 'cross' | 'none';
export type HalfSplit = 'left' | 'top';

export interface PillShapeGeometry {
  id: PillShape;
  label: string;
  outline: string;
  scorePattern: ScorePattern;
  scoreLines: string;
  /** How a ½ dose is taken when score lines define a bisection. */
  halfSplit: HalfSplit;
  supportedFractions: readonly DoseFraction[];
}

/** Reference #3: horizontal ellipse with softly tapered left/right ends. */
const POINTED_OVAL =
  'M 10 50 C 17 33 31 26 50 26 C 69 26 83 33 90 50 C 83 67 69 74 50 74 C 31 74 17 67 10 50 Z';

/** Reference #1: horizontal caplet with flat sides and fully rounded ends. */
const ROUNDED_OVAL =
  'M 30 28 H 70 C 82 28 90 38 90 50 C 90 62 82 72 70 72 H 30 C 18 72 10 62 10 50 C 10 38 18 28 30 28 Z';

/** Two vertically stacked lobes joined directly at a narrow waist. */
const CONNECTED_DOUBLE_CIRCLE =
  'M 50 14 C 65 14 74 23 74 36 C 74 43 70 48 64 50 C 70 52 74 57 74 64 C 74 77 65 86 50 86 C 35 86 26 77 26 64 C 26 57 30 52 36 50 C 30 48 26 43 26 36 C 26 23 35 14 50 14 Z';

export const PILL_SHAPE_GEOMETRY: PillShapeGeometry[] = [
  {
    id: 'freedom',
    label: 'Freedom',
    outline: 'M 20 50 C 20 32 36 28 50 50 C 64 28 80 32 80 50 C 80 68 64 72 50 50 C 36 72 20 68 20 50 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 28 L 50 72',
    halfSplit: 'left',
    supportedFractions: ['whole', 'half', 'third'],
  },
  {
    id: 'oval',
    label: 'Oval · pointed',
    outline: POINTED_OVAL,
    scorePattern: 'cross',
    scoreLines: 'M 50 28 L 50 72 M 10 50 L 90 50',
    halfSplit: 'left',
    supportedFractions: ['whole', 'half', 'third', 'quarter', 'three_quarter', 'eighth', 'sixteenth'],
  },
  {
    id: 'oval_rounded',
    label: 'Oval · rounded',
    outline: ROUNDED_OVAL,
    scorePattern: 'cross',
    scoreLines: 'M 50 28 L 50 72 M 10 50 L 90 50',
    halfSplit: 'left',
    supportedFractions: ['whole', 'half', 'third', 'quarter', 'three_quarter', 'eighth', 'sixteenth'],
  },
  {
    id: 'square',
    label: 'Square',
    outline: 'M 28 24 H 72 A 8 8 0 0 1 80 32 V 68 A 8 8 0 0 1 72 76 H 28 A 8 8 0 0 1 20 68 V 32 A 8 8 0 0 1 28 24 Z',
    scorePattern: 'cross',
    scoreLines: 'M 50 24 L 50 76 M 20 50 L 80 50',
    halfSplit: 'left',
    supportedFractions: ['whole', 'half', 'third', 'quarter', 'three_quarter', 'eighth', 'sixteenth'],
  },
  {
    id: 'capsule',
    label: 'Capsule',
    outline: 'M 38 22 H 62 A 18 18 0 0 1 62 78 H 38 A 18 18 0 0 1 38 22 Z',
    scorePattern: 'none',
    scoreLines: '',
    halfSplit: 'left',
    supportedFractions: ['whole'],
  },
  {
    id: 'pentagon',
    label: 'Pentagon',
    outline: 'M 50 18 L 78 38 L 68 78 L 32 78 L 22 38 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 18 L 50 78',
    halfSplit: 'left',
    supportedFractions: ['whole', 'half', 'third'],
  },
  {
    id: 'tear',
    label: 'Tear',
    outline: 'M 10 50 C 22 34 42 26 66 28 C 82 30 90 39 90 50 C 90 61 82 70 66 72 C 42 74 22 66 10 50 Z',
    scorePattern: 'none',
    scoreLines: '',
    halfSplit: 'left',
    supportedFractions: ['whole'],
  },
  {
    id: 'rectangle',
    label: 'Rectangle',
    outline: 'M 22 28 H 78 Q 84 28 84 34 V 66 Q 84 72 78 72 H 22 Q 16 72 16 66 V 34 Q 16 28 22 28 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 28 L 50 72',
    halfSplit: 'left',
    supportedFractions: ['whole', 'half', 'third'],
  },
  {
    id: 'hexagon',
    label: 'Hexagon',
    outline: 'M 50 18 L 76 34 L 76 66 L 50 82 L 24 66 L 24 34 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 18 L 50 82',
    halfSplit: 'left',
    supportedFractions: ['whole', 'half', 'third'],
  },
  {
    id: 'round',
    label: 'Round',
    outline: 'M 50 18 A 32 32 0 1 1 49.9 18 Z',
    scorePattern: 'cross',
    scoreLines: 'M 50 18 L 50 82 M 18 50 L 82 50',
    halfSplit: 'left',
    supportedFractions: ['whole', 'half', 'third', 'quarter', 'three_quarter', 'eighth', 'sixteenth'],
  },
  {
    id: 'triangle',
    label: 'Triangle',
    outline: 'M 50 20 L 78 78 H 22 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 20 L 50 78',
    halfSplit: 'left',
    supportedFractions: ['whole', 'half', 'third'],
  },
  {
    id: 'double_circle',
    label: 'Double circle',
    outline: CONNECTED_DOUBLE_CIRCLE,
    scorePattern: 'horizontal',
    scoreLines: 'M 36 50 L 64 50 M 50 14 L 50 86',
    halfSplit: 'top',
    supportedFractions: ['whole', 'half', 'third', 'quarter', 'three_quarter'],
  },
  {
    id: 'trapezoid',
    label: 'Trapezoid',
    outline: 'M 30 28 H 70 L 78 72 H 22 Z',
    scorePattern: 'horizontal',
    scoreLines: 'M 26 50 L 74 50',
    halfSplit: 'top',
    supportedFractions: ['whole', 'half', 'third'],
  },
  {
    id: 'octagon',
    label: 'Octagon',
    outline: 'M 34 18 H 66 L 82 34 V 66 L 66 82 H 34 L 18 66 V 34 Z',
    scorePattern: 'vertical',
    scoreLines: 'M 50 18 L 50 82',
    halfSplit: 'left',
    supportedFractions: ['whole', 'half', 'third'],
  },
  {
    id: 'diamond',
    label: 'Diamond',
    outline: 'M 50 18 L 78 50 L 50 82 L 22 50 Z',
    scorePattern: 'cross',
    scoreLines: 'M 50 18 L 50 82 M 22 50 L 78 50',
    halfSplit: 'left',
    supportedFractions: ['whole', 'half', 'third', 'quarter', 'three_quarter', 'eighth', 'sixteenth'],
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

function rectPath(x: number, y: number, w: number, h: number): string {
  return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`;
}

function proportionalTopPath(ratio: number): string {
  return rectPath(0, 0, 100, 100 * ratio);
}

function radialWedgePath(cx: number, cy: number, r: number, angleDeg: number): string {
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

function crossGridPath(fraction: DoseFraction): string | null {
  switch (fraction) {
    case 'half':
      return rectPath(0, 0, 50, 100);
    case 'quarter':
      return rectPath(0, 0, 50, 50);
    case 'three_quarter':
      return 'M 0 0 H 100 V 50 H 50 V 100 H 0 Z';
    case 'eighth':
      return rectPath(0, 0, 50, 25);
    case 'sixteenth':
      return rectPath(0, 0, 25, 25);
    default:
      return null;
  }
}

function halfPath(geo: PillShapeGeometry): string {
  if (geo.halfSplit === 'top') {
    return rectPath(0, 0, 100, 50);
  }
  return rectPath(0, 0, 50, 100);
}

function doubleCirclePath(fraction: DoseFraction): string | null {
  switch (fraction) {
    case 'half':
      // One full lobe (top).
      return rectPath(0, 0, 100, 50);
    case 'quarter':
      // Half of the top lobe: horizontal split between lobes, then vertical.
      return rectPath(0, 0, 50, 50);
    case 'three_quarter':
      // Full top lobe + half of the lower lobe.
      return 'M 0 0 H 100 V 50 H 50 V 100 H 0 Z';
    default:
      return null;
  }
}

function usesRadialEighth(shape: PillShape, fraction: DoseFraction): boolean {
  return (shape === 'round' || shape === 'diamond')
    && (fraction === 'eighth' || fraction === 'sixteenth');
}

/**
 * SVG path for the dose region, clipped to the pill outline by the renderer.
 */
export function doseRegionPath(shape: PillShape, fraction: DoseFraction): string | null {
  const geo = pillShapeGeometry(shape);
  if (!geo.supportedFractions.includes(fraction)) {
    return null;
  }

  if (fraction === 'whole') {
    return geo.outline;
  }

  if (fraction === 'third') {
    return proportionalTopPath(1 / 3);
  }

  if (usesRadialEighth(shape, fraction)) {
    return radialWedgePath(50, 50, 55, fractionAngle(fraction));
  }

  if (shape === 'double_circle') {
    return doubleCirclePath(fraction);
  }

  if (geo.scorePattern === 'cross') {
    return crossGridPath(fraction);
  }

  if (fraction === 'half') {
    return halfPath(geo);
  }

  return null;
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
  if (shape === 'capsule' || shape === 'tear') {
    return `${label} is always taken whole.`;
  }
  return `${doseFractionLabel(fraction)} is not defined for ${label}.`;
}
