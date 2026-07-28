import { describe, expect, it } from 'vitest';
import { parseAmountExpression, parseDecimal, parseWetFoodLiquidPair } from './numbers';

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

describe('parseWetFoodLiquidPair', () => {
  it('parses wet food then liquid amounts', () => {
    expect(parseWetFoodLiquidPair('123,456')).toEqual({ wetFood: 123, liquids: 456 });
    expect(parseWetFoodLiquidPair('15, 12')).toEqual({ wetFood: 15, liquids: 12 });
  });

  it('allows expressions on each side', () => {
    expect(parseWetFoodLiquidPair('450 - 320, 10 + 2')).toEqual({ wetFood: 130, liquids: 12 });
  });

  it('rejects invalid pairs', () => {
    expect(parseWetFoodLiquidPair('')).toBeNull();
    expect(parseWetFoodLiquidPair('123')).toBeNull();
    expect(parseWetFoodLiquidPair('123,')).toBeNull();
    expect(parseWetFoodLiquidPair(',456')).toBeNull();
    expect(parseWetFoodLiquidPair('0,10')).toBeNull();
    expect(parseWetFoodLiquidPair('10,0')).toBeNull();
    expect(parseWetFoodLiquidPair('1,2,3')).toBeNull();
  });
});
