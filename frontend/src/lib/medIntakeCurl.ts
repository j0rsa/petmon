import type { CreateMedIntakeRecord, DailyMedAssignment } from '../api/medications';

export function buildMedIntakePayload(
  petId: string,
  item: DailyMedAssignment,
  localDate: string,
): CreateMedIntakeRecord {
  const { medication, assignment } = item;
  const payload: CreateMedIntakeRecord = {
    pet_id: petId,
    medication_id: medication.id,
    assignment_id: assignment.id,
    taken: true,
    local_date: localDate,
  };

  if (assignment.optional) {
    if (medication.med_type === 'pill') {
      payload.dose_fraction_override = assignment.dose_fraction ?? 'whole';
    } else {
      payload.liquid_dose_ml_override = assignment.liquid_dose_ml ?? 0.6;
    }
  }

  return payload;
}

export function buildMedIntakeCurl(
  petId: string,
  item: DailyMedAssignment,
  localDate: string,
  origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8080',
): string {
  const payload = buildMedIntakePayload(petId, item, localDate);
  const body = JSON.stringify(payload);
  return [
    `curl -X POST '${origin}/api/v1/health/meds/intake' \\`,
    `  -H 'Content-Type: application/json' \\`,
    `  -d '${body.replace(/'/g, "'\\''")}'`,
  ].join('\n');
}
