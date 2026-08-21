import type {
  DoseFraction,
  MedAssignment,
  MedFrequency,
  MedType,
  PillShape,
} from '../api/medications';

export const DOSE_FRACTIONS: DoseFraction[] = [
  'whole', 'three_quarter', 'half', 'third', 'quarter', 'eighth', 'sixteenth',
];

export const EMPHASIZED_DOSE_FRACTIONS: ReadonlySet<DoseFraction> = new Set([
  'whole', 'half', 'quarter',
]);

export const PILL_SHAPES: PillShape[] = [
  'freedom', 'oval', 'oval_rounded', 'square', 'capsule', 'pentagon', 'tear', 'rectangle',
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
    case 'three_quarter': return '3/4';
    case 'half': return '1/2';
    case 'third': return '1/3';
    case 'quarter': return '1/4';
    case 'eighth': return '1/8';
    case 'sixteenth': return '1/16';
  }
}

export function pillShapeLabel(shape: PillShape): string {
  switch (shape) {
    case 'freedom': return 'Freedom';
    case 'oval': return 'Oval · pointed';
    case 'oval_rounded': return 'Oval · rounded';
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

export function expectedDoseCount(frequency: MedFrequency): number {
  return frequency.morning + frequency.midday + frequency.evening;
}

export function formatFrequency(frequency: MedFrequency): string {
  const parts = [
    frequency.morning > 0 ? `Morning ×${frequency.morning}` : null,
    frequency.midday > 0 ? `Midday ×${frequency.midday}` : null,
    frequency.evening > 0 ? `Evening ×${frequency.evening}` : null,
  ].filter((part): part is string => part != null);
  const unit = frequency.every === 1
    ? frequency.unit === 'days' ? 'day' : 'week'
    : frequency.unit;
  return `${parts.join(' · ')} · Every ${frequency.every} ${unit}`;
}

export function hasActiveAssignmentOn(assignments: MedAssignment[], date: string): boolean {
  return assignments.some(
    (assignment) =>
      assignment.date_from <= date
      && (assignment.date_to == null || assignment.date_to >= date),
  );
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
