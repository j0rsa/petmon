import type { CreateMedIntakeRecord, DailyMedAssignment } from '../api/medications';

export interface MedIntakeTiming {
  local_date?: string;
  occurred_at?: string;
}

export function buildMedIntakePayload(
  petId: string,
  item: DailyMedAssignment,
  timing: MedIntakeTiming = {},
  overrides: Partial<CreateMedIntakeRecord> = {},
): CreateMedIntakeRecord {
  const { medication, assignment } = item;
  return {
    pet_id: petId,
    medication_id: medication.id,
    assignment_id: assignment.id,
    taken: true,
    ...(timing.local_date ? { local_date: timing.local_date } : {}),
    ...(timing.occurred_at ? { occurred_at: timing.occurred_at } : {}),
    ...overrides,
  };
}

export function buildMedIntakeCurl(
  petId: string,
  item: DailyMedAssignment,
  timing: MedIntakeTiming,
  overrides: Partial<CreateMedIntakeRecord> = {},
  origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080',
): string {
  const payload = buildMedIntakePayload(petId, item, timing, overrides);
  const body = JSON.stringify(payload);
  return [
    `curl -X POST '${origin}/api/v1/health/meds/intake' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${body.replace(/'/g, "'\\''")}'`,
  ].join('\n');
}
