import { describe, expect, it } from 'vitest';
import { doseRegionPath, isDoseSupported, pillShapeGeometry, PILL_SHAPE_GEOMETRY } from './pillDoseCuts';

describe('pillDoseCuts', () => {
  it('capsule and tear are whole only', () => {
    for (const shape of ['capsule', 'tear'] as const) {
      expect(isDoseSupported(shape, 'whole')).toBe(true);
      expect(isDoseSupported(shape, 'half')).toBe(false);
      expect(doseRegionPath(shape, 'half')).toBeNull();
    }
  });

  it('oval half is top half (upright)', () => {
    expect(pillShapeGeometry('oval').halfSplit).toBe('top');
    expect(doseRegionPath('oval', 'half')).toBe('M 0 0 H 100 V 50 H 0 Z');
  });

  it('third uses proportional top fill', () => {
    const d = doseRegionPath('square', 'third');
    expect(d).toContain('33.333');
  });

  it('round eighth and sixteenth use radial wedges', () => {
    expect(isDoseSupported('round', 'eighth')).toBe(true);
    expect(isDoseSupported('round', 'sixteenth')).toBe(true);
    expect(doseRegionPath('round', 'eighth')).toMatch(/^M 50 50 L/);
  });

  it('diamond eighth and sixteenth use radial wedges', () => {
    expect(isDoseSupported('diamond', 'eighth')).toBe(true);
    expect(doseRegionPath('diamond', 'sixteenth')).toMatch(/^M 50 50 L/);
  });

  it('double circle quarter and three_quarter follow lobe rules', () => {
    expect(doseRegionPath('double_circle', 'quarter')).toBe('M 0 0 H 100 V 25 H 0 Z');
    expect(doseRegionPath('double_circle', 'three_quarter')).toBe('M 0 0 H 100 V 75 H 0 Z');
  });

  it('every shape has a label', () => {
    for (const geo of PILL_SHAPE_GEOMETRY) {
      expect(geo.label.length).toBeGreaterThan(0);
    }
  });
});
