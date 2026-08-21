import { describe, expect, it } from 'vitest';
import { doseRegionPath, isDoseSupported, pillShapeGeometry, PILL_SHAPE_GEOMETRY } from './pillDoseCuts';

describe('pillDoseCuts', () => {
  it('capsule only supports whole', () => {
    expect(isDoseSupported('capsule', 'whole')).toBe(true);
    expect(isDoseSupported('capsule', 'half')).toBe(false);
    expect(doseRegionPath('capsule', 'half')).toBeNull();
  });

  it('oval half uses vertical score piece', () => {
    expect(doseRegionPath('oval', 'half')).toContain('50');
  });

  it('round quarter uses cross grid', () => {
    expect(isDoseSupported('round', 'quarter')).toBe(true);
    expect(isDoseSupported('round', 'eighth')).toBe(false);
  });

  it('trapezoid third is undefined', () => {
    expect(isDoseSupported('trapezoid', 'third')).toBe(false);
  });

  it('every shape has a label', () => {
    for (const geo of PILL_SHAPE_GEOMETRY) {
      expect(geo.label.length).toBeGreaterThan(0);
    }
    expect(pillShapeGeometry('freedom').label).toBe('Freedom');
  });
});
