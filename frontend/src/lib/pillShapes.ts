import type { DoseFraction, PillShape } from '../api/medications';
import { fractionAngle } from './medications';

export type PillFillMode = 'radial' | 'horizontal' | 'quadrant';

export interface PillShapeDef {
  id: PillShape;
  label: string;
  path: string;
  fillMode: PillFillMode;
  scoreLines: string;
}

/** SVG paths in a 100×100 viewBox. */
export const PILL_SHAPE_DEFS: PillShapeDef[] = [
  {
    id: 'freedom',
    label: 'Freedom',
    path: 'M 20 50 C 20 32 36 28 50 50 C 64 28 80 32 80 50 C 80 68 64 72 50 50 C 36 72 20 68 20 50 Z',
    fillMode: 'horizontal',
    scoreLines: 'M 50 36 L 50 64',
  },
  {
    id: 'oval',
    label: 'Oval',
    path: 'M 14 50 A 36 20 0 1 1 86 50 A 36 20 0 1 1 14 50 Z',
    fillMode: 'horizontal',
    scoreLines: 'M 14 50 L 86 50',
  },
  {
    id: 'square',
    label: 'Square',
    path: 'M 28 24 H 72 A 8 8 0 0 1 80 32 V 68 A 8 8 0 0 1 72 76 H 28 A 8 8 0 0 1 20 68 V 32 A 8 8 0 0 1 28 24 Z',
    fillMode: 'quadrant',
    scoreLines: 'M 50 24 L 50 76 M 20 50 L 80 50',
  },
  {
    id: 'capsule',
    label: 'Capsule',
    path: 'M 38 22 H 62 A 18 18 0 0 1 62 78 H 38 A 18 18 0 0 1 38 22 Z',
    fillMode: 'horizontal',
    scoreLines: 'M 50 22 L 50 78',
  },
  {
    id: 'pentagon',
    label: 'Pentagon',
    path: 'M 50 18 L 78 38 L 68 78 L 32 78 L 22 38 Z',
    fillMode: 'radial',
    scoreLines: 'M 50 18 L 50 78',
  },
  {
    id: 'tear',
    label: 'Tear',
    path: 'M 50 18 C 68 34 72 58 50 82 C 28 58 32 34 50 18 Z',
    fillMode: 'horizontal',
    scoreLines: 'M 50 18 L 50 82',
  },
  {
    id: 'rectangle',
    label: 'Rectangle',
    path: 'M 22 30 H 78 A 6 6 0 0 1 84 36 V 64 A 6 6 0 0 1 78 70 H 22 A 6 6 0 0 1 16 64 V 36 A 6 6 0 0 1 22 30 Z',
    fillMode: 'horizontal',
    scoreLines: 'M 16 50 L 84 50',
  },
  {
    id: 'hexagon',
    label: 'Hexagon',
    path: 'M 50 18 L 76 34 L 76 66 L 50 82 L 24 66 L 24 34 Z',
    fillMode: 'radial',
    scoreLines: 'M 50 18 L 50 82',
  },
  {
    id: 'round',
    label: 'Round',
    path: 'M 50 18 A 32 32 0 1 1 49.9 18 Z',
    fillMode: 'radial',
    scoreLines: 'M 50 18 L 50 82 M 18 50 L 82 50',
  },
  {
    id: 'triangle',
    label: 'Triangle',
    path: 'M 50 20 L 78 78 H 22 Z',
    fillMode: 'horizontal',
    scoreLines: 'M 50 20 L 50 78',
  },
  {
    id: 'double_circle',
    label: 'Double circle',
    path: 'M 34 50 A 16 16 0 1 1 34 49.9 L 66 49.9 A 16 16 0 1 1 66 50 Z',
    fillMode: 'horizontal',
    scoreLines: 'M 20 50 L 80 50',
  },
  {
    id: 'trapezoid',
    label: 'Trapezoid',
    path: 'M 30 28 H 70 L 78 72 H 22 Z',
    fillMode: 'horizontal',
    scoreLines: 'M 50 28 L 50 72',
  },
  {
    id: 'octagon',
    label: 'Octagon',
    path: 'M 34 18 H 66 L 82 34 V 66 L 66 82 H 34 L 18 66 V 34 Z',
    fillMode: 'radial',
    scoreLines: 'M 50 18 L 50 82',
  },
  {
    id: 'diamond',
    label: 'Diamond',
    path: 'M 50 18 L 78 50 L 50 82 L 22 50 Z',
    fillMode: 'quadrant',
    scoreLines: 'M 50 18 L 50 82 M 22 50 L 78 50',
  },
];

export function pillShapeDef(shape: PillShape): PillShapeDef {
  return PILL_SHAPE_DEFS.find((s) => s.id === shape) ?? PILL_SHAPE_DEFS.find((s) => s.id === 'round')!;
}

function fractionHeightRatio(fraction: DoseFraction): number {
  switch (fraction) {
    case 'whole': return 1;
    case 'half': return 0.5;
    case 'quarter': return 0.25;
    case 'three_quarter': return 0.75;
    case 'eighth': return 0.125;
    case 'sixteenth': return 0.0625;
  }
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

function quadrantRect(fraction: DoseFraction): { x: number; y: number; w: number; h: number } {
  switch (fraction) {
    case 'whole': return { x: 0, y: 0, w: 100, h: 100 };
    case 'half': return { x: 0, y: 0, w: 100, h: 50 };
    case 'quarter': return { x: 0, y: 0, w: 50, h: 50 };
    case 'three_quarter': return { x: 0, y: 0, w: 100, h: 75 };
    case 'eighth': return { x: 0, y: 0, w: 50, h: 25 };
    case 'sixteenth': return { x: 0, y: 0, w: 25, h: 25 };
  }
}

export function pillFractionFill(
  fillMode: PillFillMode,
  fraction: DoseFraction,
): { element: 'path' | 'rect'; d?: string; rect?: { x: number; y: number; w: number; h: number } } {
  if (fraction === 'whole') {
    return { element: 'rect', rect: { x: 0, y: 0, w: 100, h: 100 } };
  }
  if (fillMode === 'radial') {
    return { element: 'path', d: wedgePath(50, 50, 55, fractionAngle(fraction)) };
  }
  if (fillMode === 'quadrant') {
    return { element: 'rect', rect: quadrantRect(fraction) };
  }
  const ratio = fractionHeightRatio(fraction);
  return { element: 'rect', rect: { x: 0, y: 0, w: 100, h: 100 * ratio } };
}
