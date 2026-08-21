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

  it('both horizontal Oval variants use square-like cross cuts', () => {
    for (const shape of ['oval', 'oval_rounded'] as const) {
      expect(pillShapeGeometry(shape).scorePattern).toBe('cross');
      expect(pillShapeGeometry(shape).halfSplit).toBe('left');
      expect(isDoseSupported(shape, 'quarter')).toBe(true);
      expect(doseRegionPath(shape, 'half')).toBe('M 0 0 H 50 V 100 H 0 Z');
      expect(doseRegionPath(shape, 'quarter')).toBe('M 0 0 H 50 V 50 H 0 Z');
    }
  });

  it('models both visual variants of the Oval category', () => {
    expect(pillShapeGeometry('oval').label).toBe('Oval · pointed');
    expect(pillShapeGeometry('oval').outline).toContain('M 10 50');
    expect(pillShapeGeometry('oval_rounded').label).toBe('Oval · rounded');
    expect(pillShapeGeometry('oval_rounded').outline).toContain('M 30 28 H 70');
    expect(pillShapeGeometry('rectangle').label).toBe('Rectangle');
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
    const geometry = pillShapeGeometry('double_circle');
    expect(geometry.outline).not.toContain(' L 66');
    expect(geometry.scoreLines).toBe('M 36 50 L 64 50 M 50 14 L 50 86');
    expect(doseRegionPath('double_circle', 'quarter')).toBe('M 0 0 H 50 V 50 H 0 Z');
    expect(doseRegionPath('double_circle', 'three_quarter')).toBe('M 0 0 H 100 V 50 H 50 V 100 H 0 Z');
  });

  it('every shape has a label', () => {
    for (const geo of PILL_SHAPE_GEOMETRY) {
      expect(geo.label.length).toBeGreaterThan(0);
    }
  });
});
