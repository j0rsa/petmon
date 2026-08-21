import { describe, expect, it } from 'vitest';
import {
  DOSE_FRACTIONS,
  EMPHASIZED_DOSE_FRACTIONS,
  doseFractionLabel,
} from './medications';

describe('medication dose buttons', () => {
  it('orders doses from largest to smallest', () => {
    expect(DOSE_FRACTIONS).toEqual([
      'whole',
      'three_quarter',
      'half',
      'third',
      'quarter',
      'eighth',
      'sixteenth',
    ]);
  });

  it('uses uniform slash labels', () => {
    expect(DOSE_FRACTIONS.map(doseFractionLabel)).toEqual([
      '1',
      '3/4',
      '1/2',
      '1/3',
      '1/4',
      '1/8',
      '1/16',
    ]);
  });

  it('emphasizes whole, half, and quarter', () => {
    expect([...EMPHASIZED_DOSE_FRACTIONS]).toEqual(['whole', 'half', 'quarter']);
  });
});
