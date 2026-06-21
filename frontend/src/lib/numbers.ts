/** Normalise a locale-aware decimal string and parse it as a float.
 *  Accepts both "." and "," as decimal separators (e.g. "4,35" → 4.35).
 *  Returns NaN for empty or non-numeric input. */
export function parseDecimal(raw: string): number {
  return parseFloat(raw.replace(',', '.').trim());
}
