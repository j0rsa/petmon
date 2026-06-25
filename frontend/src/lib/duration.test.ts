import { describe, it, expect } from 'vitest';
import { digitsToDisplay, digitsToSecs, secsToDigits, normaliseDigits } from './duration';

// ── digitsToDisplay ───────────────────────────────────────────────────────────

describe('digitsToDisplay', () => {
  it('empty string shows 00:00', () => expect(digitsToDisplay('')).toBe('00:00'));
  it('1 digit  → 00:01', () => expect(digitsToDisplay('1')).toBe('00:01'));
  it('2 digits → 00:12', () => expect(digitsToDisplay('12')).toBe('00:12'));
  it('3 digits → 01:23', () => expect(digitsToDisplay('123')).toBe('01:23'));
  it('4 digits → 12:34', () => expect(digitsToDisplay('1234')).toBe('12:34'));
  it('0000 → 00:00', () => expect(digitsToDisplay('0000')).toBe('00:00'));
  it('0095 → 00:95 (raw, not normalised)', () => expect(digitsToDisplay('0095')).toBe('00:95'));
});

// ── digitsToSecs ──────────────────────────────────────────────────────────────

describe('digitsToSecs', () => {
  it('empty string → null', () => expect(digitsToSecs('')).toBeNull());
  it('0000 → null (zero duration)', () => expect(digitsToSecs('0000')).toBeNull());
  it('1 → 1s', () => expect(digitsToSecs('1')).toBe(1));
  it('100 → 1m00s = 60', () => expect(digitsToSecs('100')).toBe(60));
  it('123 → 1m23s = 83', () => expect(digitsToSecs('123')).toBe(83));
  it('1234 → 12m34s = 754', () => expect(digitsToSecs('1234')).toBe(754));
  it('0095 → 0m95s = 95 (overflow, not normalised here)', () => expect(digitsToSecs('0095')).toBe(95));
  it('9999 → 99m99s = 6039', () => expect(digitsToSecs('9999')).toBe(99 * 60 + 99));
});

// ── secsToDigits ──────────────────────────────────────────────────────────────

describe('secsToDigits', () => {
  it('0 → 0000', () => expect(secsToDigits(0)).toBe('0000'));
  it('1 → 0001', () => expect(secsToDigits(1)).toBe('0001'));
  it('60 → 0100 (1m00s)', () => expect(secsToDigits(60)).toBe('0100'));
  it('83 → 0123 (1m23s)', () => expect(secsToDigits(83)).toBe('0123'));
  it('754 → 1234 (12m34s)', () => expect(secsToDigits(754)).toBe('1234'));
  it('95 → 0135 (1m35s)', () => expect(secsToDigits(95)).toBe('0135'));
  it('3599 → 5959 (59m59s)', () => expect(secsToDigits(3599)).toBe('5959'));
});

// ── normaliseDigits (the blur handler) ───────────────────────────────────────

describe('normaliseDigits', () => {
  it('empty string stays empty', () => expect(normaliseDigits('')).toBe(''));
  it('0000 stays 0000 (zero is not normalised to non-zero)', () => expect(normaliseDigits('0000')).toBe('0000'));
  it('0095 → 0135 (95s → 1m35s)', () => expect(normaliseDigits('0095')).toBe('0135'));
  it('0060 → 0100 (60s → 1m00s)', () => expect(normaliseDigits('0060')).toBe('0100'));
  it('0199 → 0259 (99s overflow: 1m + 99s = 2m39s… wait: 60+99=159s=2m39s)', () =>
    expect(normaliseDigits('0199')).toBe('0239'));
  it('0123 stays 0123 (already valid)', () => expect(normaliseDigits('0123')).toBe('0123'));
  it('1234 stays 1234 (already valid)', () => expect(normaliseDigits('1234')).toBe('1234'));
  it('1 → 0001', () => expect(normaliseDigits('1')).toBe('0001'));
  it('100 → 0100', () => expect(normaliseDigits('100')).toBe('0100'));
});

// ── round-trip: digits → secs → digits ───────────────────────────────────────

describe('round-trip', () => {
  const cases: [string, number][] = [
    ['0001',  1],
    ['0030', 30],
    ['0059', 59],
    ['0100', 60],
    ['0123', 83],
    ['0135', 95],
    ['1234', 754],
    ['5959', 3599],
  ];
  for (const [digits, secs] of cases) {
    it(`${digits} → ${secs}s → ${digits}`, () => {
      expect(digitsToSecs(digits)).toBe(secs);
      expect(secsToDigits(secs)).toBe(digits);
    });
  }
});
