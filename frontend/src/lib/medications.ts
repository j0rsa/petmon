import type { DoseFraction, MedType, PillShape } from '../api/medications';

export const DOSE_FRACTIONS: DoseFraction[] = [
  'whole', 'half', 'quarter', 'three_quarter', 'eighth', 'sixteenth',
];

export const PILL_SHAPES: PillShape[] = ['round_1_precut', 'round_2_precut', 'ellipse_1_precut'];

export const MED_COLORS = [
  '#6366f1', '#ec4899', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#8b5cf6', '#ef4444', '#64748b', '#14b8a6',
];

export function doseFractionLabel(fraction: DoseFraction): string {
  switch (fraction) {
    case 'whole': return '1';
    case 'half': return '½';
    case 'quarter': return '¼';
    case 'three_quarter': return '¾';
    case 'eighth': return '⅛';
    case 'sixteenth': return '1/16';
  }
}

export function pillShapeLabel(shape: PillShape): string {
  switch (shape) {
    case 'round_1_precut': return 'Round · 1 cut';
    case 'round_2_precut': return 'Round · 2 cuts';
    case 'ellipse_1_precut': return 'Ellipse · 1 cut';
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
