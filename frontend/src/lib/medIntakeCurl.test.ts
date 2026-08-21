import { describe, expect, it } from 'vitest';
import { mockDailyMedAssignments, mockPetId } from '../stories/fixtures';
import { buildMedIntakeCurl, buildMedIntakePayload } from './medIntakeCurl';

const timing = {
  local_date: '2026-08-21',
  occurred_at: '2026-08-21T08:30:00',
};

describe('buildMedIntakePayload', () => {
  it('includes core ids and timing for scheduled pill intake', () => {
    const item = mockDailyMedAssignments[0];
    const payload = buildMedIntakePayload(mockPetId, item, timing);

    expect(payload).toEqual({
      pet_id: mockPetId,
      medication_id: item.medication.id,
      assignment_id: item.assignment.id,
      taken: true,
      local_date: '2026-08-21',
      occurred_at: '2026-08-21T08:30:00',
    });
  });

  it('includes the supplied liquid override for optional liquid meds', () => {
    const item = mockDailyMedAssignments[1];
    const payload = buildMedIntakePayload(mockPetId, item, timing, {
      liquid_dose_ml_override: 1.25,
    });

    expect(payload.liquid_dose_ml_override).toBe(1.25);
  });
});

describe('buildMedIntakeCurl', () => {
  it('builds a no-auth curl command with the intake payload', () => {
    const item = mockDailyMedAssignments[0];
    const curl = buildMedIntakeCurl(mockPetId, item, timing, {}, 'http://localhost:8080');

    expect(curl).toContain("curl -X POST 'http://localhost:8080/api/v1/health/meds/intake'");
    expect(curl).toContain("-H 'Content-Type: application/json'");
    expect(curl).toContain(`"pet_id":"${mockPetId}"`);
    expect(curl).toContain(`"medication_id":"${item.medication.id}"`);
    expect(curl).toContain(`"assignment_id":"${item.assignment.id}"`);
    expect(curl).toContain('"taken":true');
    expect(curl).toContain('"local_date":"2026-08-21"');
    expect(curl).toContain('"occurred_at":"2026-08-21T08:30:00"');
    expect(curl).not.toContain('Authorization');
  });
});
