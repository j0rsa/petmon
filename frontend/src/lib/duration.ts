// ATM-style duration helpers — digits is up to 4 raw digit chars, right-to-left filled.

export function digitsToDisplay(digits: string): string {
  const padded = digits.padStart(4, '0');
  return `${padded.slice(0, 2)}:${padded.slice(2)}`;
}

export function digitsToSecs(digits: string): number | null {
  if (!digits) return null;
  const padded = digits.padStart(4, '0');
  const m = parseInt(padded.slice(0, 2), 10);
  const s = parseInt(padded.slice(2), 10);
  const total = m * 60 + s;
  return total > 0 ? total : null;
}

export function secsToDigits(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${String(m).padStart(2, '0')}${String(s).padStart(2, '0')}`;
}

// Normalise digits on blur: push any overflow in seconds into minutes.
export function normaliseDigits(digits: string): string {
  const secs = digitsToSecs(digits);
  return secs !== null ? secsToDigits(secs) : digits;
}
