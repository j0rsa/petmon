import type { DoseFraction, MedType, PillShape } from '../api/medications';

export const DOSE_FRACTIONS: DoseFraction[] = [
  'whole', 'half', 'third', 'quarter', 'three_quarter', 'eighth', 'sixteenth',
];

export const PILL_SHAPES: PillShape[] = [
  'freedom', 'oval', 'square', 'capsule', 'pentagon', 'tear', 'rectangle',
  'hexagon', 'round', 'triangle', 'double_circle', 'trapezoid', 'octagon', 'diamond',
];

/** 36-color palette (6×6). */
export const MED_COLOR_PALETTE = [
  '#6366f1', '#818cf8', '#a78bfa', '#c084fc', '#e879f9', '#f472b6',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#fb923c', '#fbbf24',
  '#eab308', '#a3e635', '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#2563eb', '#1d4ed8', '#4f46e5',
  '#7c3aed', '#9333ea', '#64748b', '#475569', '#78716c', '#a8a29e',
  '#d6d3d1', '#fda4af', '#fdba74', '#fde047', '#86efac', '#67e8f9',
];

export function randomMedColor(): string {
  return MED_COLOR_PALETTE[Math.floor(Math.random() * MED_COLOR_PALETTE.length)]!;
}

export function doseFractionLabel(fraction: DoseFraction): string {
  switch (fraction) {
    case 'whole': return '1';
    case 'half': return '½';
    case 'third': return '⅓';
    case 'quarter': return '¼';
    case 'three_quarter': return '¾';
    case 'eighth': return '⅛';
    case 'sixteenth': return '1/16';
  }
}

export function pillShapeLabel(shape: PillShape): string {
  switch (shape) {
    case 'freedom': return 'Freedom';
    case 'oval': return 'Oval';
    case 'square': return 'Square';
    case 'capsule': return 'Capsule';
    case 'pentagon': return 'Pentagon';
    case 'tear': return 'Tear';
    case 'rectangle': return 'Rectangle';
    case 'hexagon': return 'Hexagon';
    case 'round': return 'Round';
    case 'triangle': return 'Triangle';
    case 'double_circle': return 'Double circle';
    case 'trapezoid': return 'Trapezoid';
    case 'octagon': return 'Octagon';
    case 'diamond': return 'Diamond';
  }
}

export function medTypeLabel(type: MedType): string {
  return type === 'pill' ? 'Pill' : 'Liquid';
}

export function formatFrequency(times: string[]): string {
  if (times.length === 0) return 'As scheduled';
  return times.join(', ');
}

export function fractionAngle(fraction: DoseFraction): number {
  switch (fraction) {
    case 'whole': return 360;
    case 'half': return 180;
    case 'third': return 120;
    case 'quarter': return 90;
    case 'three_quarter': return 270;
    case 'eighth': return 45;
    case 'sixteenth': return 22.5;
  }
}

export function intakeStatus(intakes: { taken: boolean }[], expectedTimes: number): 'done' | 'partial' | 'pending' | 'skipped' {
  if (intakes.length === 0) return 'pending';
  const takenCount = intakes.filter((i) => i.taken).length;
  const skippedCount = intakes.filter((i) => !i.taken).length;
  if (takenCount >= Math.max(1, expectedTimes)) return 'done';
  if (takenCount > 0) return 'partial';
  if (skippedCount > 0) return 'skipped';
  return 'pending';
}

export function intakeStatusLabel(status: ReturnType<typeof intakeStatus>): string {
  switch (status) {
    case 'done': return 'Taken';
    case 'partial': return 'Partial';
    case 'skipped': return 'Skipped';
    case 'pending': return 'Pending';
  }
}

export function formulationLabel(strengthMg: number | null | undefined, shape: PillShape | null | undefined): string {
  if (strengthMg == null) return 'Liquid';
  const shapeLabel = shape ? pillShapeLabel(shape) : 'Pill';
  return `${strengthMg}mg · ${shapeLabel}`;
}
