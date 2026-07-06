import { describe, expect, it } from 'vitest';
import { parseAmountExpression, parseDecimal } from './numbers';

describe('parseDecimal', () => {
  it('parses comma decimals', () => {
    expect(parseDecimal('4,35')).toBe(4.35);
  });
});

describe('parseAmountExpression', () => {
  it('parses plain numbers', () => {
    expect(parseAmountExpression('12')).toBe(12);
    expect(parseAmountExpression('4,5')).toBe(4.5);
  });

  it('evaluates subtraction for before/after weights', () => {
    expect(parseAmountExpression('450 - 320')).toBe(130);
    expect(parseAmountExpression('450-320')).toBe(130);
  });

  it('evaluates other basic operators', () => {
    expect(parseAmountExpression('10 + 5')).toBe(15);
    expect(parseAmountExpression('10 * 2.5')).toBe(25);
    expect(parseAmountExpression('20 / 4')).toBe(5);
  });

  it('respects operator precedence', () => {
    expect(parseAmountExpression('2 + 3 * 4')).toBe(14);
  });

  it('rejects invalid input', () => {
    expect(parseAmountExpression('')).toBeNaN();
    expect(parseAmountExpression('abc')).toBeNaN();
    expect(parseAmountExpression('450 -')).toBeNaN();
    expect(parseAmountExpression('1 + 2 +')).toBeNaN();
  });
});
