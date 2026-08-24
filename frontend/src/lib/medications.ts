import { ApiError } from '../api/client';
import type {
  DailyMedAssignment,
  DoseFraction,
  MedAssignment,
  MedBundle,
  MedFrequency,
  MedIntakeRecord,
  MedType,
  PillShape,
} from '../api/medications';
import { daysInclusive, shiftDate } from './dates';

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

export function assignmentStatus(
  assignment: MedAssignment,
  date: string,
): 'upcoming' | 'active' | 'ended' {
  if (assignment.date_from > date) return 'upcoming';
  if (assignment.date_to != null && assignment.date_to < date) return 'ended';
  return 'active';
}

export function assignmentStatusLabel(status: ReturnType<typeof assignmentStatus>): string {
  switch (status) {
    case 'upcoming': return 'Upcoming';
    case 'active': return 'Active';
    case 'ended': return 'Ended';
  }
}

export interface AssignmentGroup {
  medicationId: string;
  current: MedAssignment;
  past: MedAssignment[];
}

function assignmentStatusRank(status: ReturnType<typeof assignmentStatus>): number {
  switch (status) {
    case 'active': return 0;
    case 'upcoming': return 1;
    case 'ended': return 2;
  }
}

export function compareAssignments(a: MedAssignment, b: MedAssignment): number {
  const byFrom = b.date_from.localeCompare(a.date_from);
  if (byFrom !== 0) return byFrom;
  return b.created_at.localeCompare(a.created_at);
}

/** One group per medication: latest/current course first, older courses in `past`. */
export function groupAssignmentsByMedication(
  assignments: MedAssignment[],
  date: string,
): AssignmentGroup[] {
  const byMed = new Map<string, MedAssignment[]>();
  for (const assignment of assignments) {
    const list = byMed.get(assignment.medication_id) ?? [];
    list.push(assignment);
    byMed.set(assignment.medication_id, list);
  }

  const groups: AssignmentGroup[] = [];
  for (const [medicationId, list] of byMed) {
    const sorted = [...list].sort((a, b) => {
      const rank = assignmentStatusRank(assignmentStatus(a, date))
        - assignmentStatusRank(assignmentStatus(b, date));
      if (rank !== 0) return rank;
      return compareAssignments(a, b);
    });
    const [current, ...past] = sorted;
    if (current == null) continue;
    groups.push({ medicationId, current, past });
  }

  return groups.sort((a, b) => {
    const rank = assignmentStatusRank(assignmentStatus(a.current, date))
      - assignmentStatusRank(assignmentStatus(b.current, date));
    if (rank !== 0) return rank;
    return compareAssignments(a.current, b.current);
  });
}

export function assignmentHistoryLabel(count: number): string {
  return count === 1 ? '1 earlier assignment' : `${count} earlier assignments`;
}

export interface ConsecutiveCourse {
  from: string;
  to: string;
  days: number;
  ongoing: boolean;
}

/** True when `later` starts on or before the day after `earlier` ended — no pause between them. */
export function assignmentsChainWithoutPause(earlier: MedAssignment, later: MedAssignment): boolean {
  if (earlier.date_to == null) return false;
  return later.date_from <= shiftDate(earlier.date_to, 1);
}

/**
 * Uninterrupted stretch ending at `current`: walk earlier assignments until a pause (calendar gap).
 * Active courses count through `today`; ended courses count through `current.date_to`.
 */
export function consecutiveCourse(
  current: MedAssignment,
  past: MedAssignment[],
  today: string,
): ConsecutiveCourse | null {
  if (current.date_from > today) return null;
  let start = current;
  const older = [...past]
    .filter((assignment) => {
      const byFrom = assignment.date_from.localeCompare(current.date_from);
      if (byFrom !== 0) return byFrom < 0;
      return assignment.created_at.localeCompare(current.created_at) < 0;
    })
    .sort((a, b) => {
      const byFrom = b.date_from.localeCompare(a.date_from);
      if (byFrom !== 0) return byFrom;
      return b.created_at.localeCompare(a.created_at);
    });
  for (const previous of older) {
    if (!assignmentsChainWithoutPause(previous, start)) break;
    start = previous;
  }
  const ongoing = current.date_to == null || current.date_to >= today;
  const to = ongoing ? today : current.date_to!;
  if (start.date_from > to) return null;
  return {
    from: start.date_from,
    to,
    days: daysInclusive(start.date_from, to),
    ongoing,
  };
}

export function consecutiveCourseLabel(
  course: ConsecutiveCourse,
  formatDate: (date: string, style?: 'long' | 'short') => string,
): string {
  const count = course.days === 1 ? '1 day' : `${course.days} days`;
  const from = formatDate(course.from, 'short');
  if (course.ongoing) return `${count} · since ${from}`;
  return `${count} · ${from} → ${formatDate(course.to, 'short')}`;
}

export function assignmentDeleteErrorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 400) {
    return 'This assignment has logged doses, so it can’t be deleted. Pause it to stop the schedule, or undo those doses first.';
  }
  return 'Assignment could not be deleted.';
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

export function assignmentScheduleLabel(assignment: MedAssignment): string {
  if (assignment.optional) return 'Optional';
  return formatFrequency(assignment.frequency);
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

/** Current courses that can be bundled: scheduled (not optional) and not ended. */
export function bundleableAssignments(assignments: MedAssignment[], date: string): MedAssignment[] {
  return groupAssignmentsByMedication(assignments, date)
    .map((group) => group.current)
    .filter((assignment) => !assignment.optional && assignmentStatus(assignment, date) !== 'ended');
}

/** Scheduled courses that are not already a member of any bundle. */
export function unbundledAssignments(
  assignments: MedAssignment[],
  bundles: MedBundle[],
  date: string,
): MedAssignment[] {
  const bundled = new Set(
    bundles.flatMap((bundle) => bundle.items.map((item) => item.medication_id)),
  );
  return bundleableAssignments(assignments, date)
    .filter((assignment) => !bundled.has(assignment.medication_id));
}

export function defaultBundleName(names: string[]): string {
  return names.filter((name) => name.trim().length > 0).join(' + ');
}

/** Every member must be due today as a scheduled (non-optional) daily row. */
export function bundleDailyMembers(
  bundle: MedBundle,
  daily: DailyMedAssignment[],
): DailyMedAssignment[] | null {
  const members: DailyMedAssignment[] = [];
  for (const item of bundle.items) {
    const dailyItem = daily.find((entry) => entry.medication.id === item.medication_id);
    if (dailyItem == null || dailyItem.assignment.optional) return null;
    members.push(dailyItem);
  }
  return members.length === bundle.items.length ? members : null;
}

export function bundleCanTakeNow(members: DailyMedAssignment[]): boolean {
  return members.every(
    (item) => intakeStatus(item.intakes, expectedDoseCount(item.assignment.frequency)) !== 'done',
  );
}

/** Latest shared take across bundle members (same `occurred_at`), one record per member. */
export function lastBundleIntakes(members: DailyMedAssignment[]): MedIntakeRecord[] {
  const latest = members
    .flatMap((item) => item.intakes)
    .sort((a, b) => {
      const byOccurred = b.occurred_at.localeCompare(a.occurred_at);
      if (byOccurred !== 0) return byOccurred;
      return b.created_at.localeCompare(a.created_at);
    })[0];
  if (latest == null) return [];
  return members.flatMap((item) => {
    const match = [...item.intakes]
      .filter((intake) => intake.occurred_at === latest.occurred_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return match == null ? [] : [match];
  });
}

export function formulationLabel(strengthMg: number | null | undefined, shape: PillShape | null | undefined): string {
  if (strengthMg == null) return 'Liquid';
  const shapeLabel = shape ? pillShapeLabel(shape) : 'Pill';
  return `${strengthMg}mg · ${shapeLabel}`;
}
