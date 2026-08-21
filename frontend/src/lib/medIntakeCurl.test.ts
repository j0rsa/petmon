import { describe, expect, it } from 'vitest';
import { mockDailyMedAssignments, mockPetId } from '../stories/fixtures';
import { buildMedIntakeCurl, buildMedIntakePayload } from './medIntakeCurl';

describe('buildMedIntakePayload', () => {
  it('includes core ids for scheduled pill intake', () => {
    const item = mockDailyMedAssignments[0];
    const payload = buildMedIntakePayload(mockPetId, item, '2026-08-21');

    expect(payload).toEqual({
      pet_id: mockPetId,
      medication_id: item.medication.id,
      assignment_id: item.assignment.id,
      taken: true,
      local_date: '2026-08-21',
    });
  });

  it('includes liquid override for optional liquid meds', () => {
    const item = mockDailyMedAssignments[1];
    const payload = buildMedIntakePayload(mockPetId, item, '2026-08-21');

    expect(payload.liquid_dose_ml_override).toBe(0.6);
  });
});

describe('buildMedIntakeCurl', () => {
  it('builds a no-auth curl command with the intake payload', () => {
    const item = mockDailyMedAssignments[0];
    const curl = buildMedIntakeCurl(mockPetId, item, '2026-08-21', 'http://localhost:8080');

    expect(curl).toContain("curl -X POST 'http://localhost:8080/api/v1/health/meds/intake'");
    expect(curl).toContain("-H 'Content-Type: application/json'");
    expect(curl).toContain(`"pet_id":"${mockPetId}"`);
    expect(curl).toContain(`"medication_id":"${item.medication.id}"`);
    expect(curl).toContain(`"assignment_id":"${item.assignment.id}"`);
    expect(curl).toContain('"taken":true');
    expect(curl).toContain('"local_date":"2026-08-21"');
    expect(curl).not.toContain('Authorization');
  });
});
