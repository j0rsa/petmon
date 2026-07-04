/** Normalise a locale-aware decimal string and parse it as a float.
 *  Accepts both "." and "," as decimal separators (e.g. "4,35" → 4.35).
 *  Returns NaN for empty or non-numeric input. */
export function parseDecimal(raw: string): number {
  return parseFloat(raw.replace(',', '.').trim());
}

const AMOUNT_EXPRESSION_RE = /^[\d\s.,+\-*/()]+$/;

/** Parse a plain decimal or simple arithmetic expression (e.g. "450 - 320" → 130). */
export function parseAmountExpression(raw: string): number {
  const trimmed = raw.trim();
  if (!trimmed) return NaN;

  const compact = trimmed.replace(/\s+/g, '');
  if (/^[+-]?[\d.,]+$/.test(compact)) {
    return parseDecimal(trimmed);
  }

  if (!AMOUNT_EXPRESSION_RE.test(trimmed)) {
    return NaN;
  }

  try {
    const value = evaluateSimpleExpression(compact);
    if (!Number.isFinite(value)) return NaN;
    return Math.round(value * 100) / 100;
  } catch {
    return NaN;
  }
}

function evaluateSimpleExpression(input: string): number {
  const chars = [...input];
  let index = 0;

  function peek(): string | undefined {
    return chars[index];
  }

  function consume(): string {
    return chars[index++];
  }

  function parseNumber(): number {
    const start = index;
    while (index < chars.length && /[\d.,]/.test(chars[index]!)) {
      index++;
    }
    if (start === index) {
      throw new Error('expected number');
    }
    return parseDecimal(chars.slice(start, index).join(''));
  }

  function parseFactor(): number {
    const ch = peek();
    if (ch === '(') {
      consume();
      const value = parseExpression();
      if (consume() !== ')') {
        throw new Error('expected )');
      }
      return value;
    }
    if (ch === '-') {
      consume();
      return -parseFactor();
    }
    if (ch === '+') {
      consume();
      return parseFactor();
    }
    return parseNumber();
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (index < chars.length && (peek() === '*' || peek() === '/')) {
      const op = consume();
      const rhs = parseFactor();
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }

  function parseExpression(): number {
    let value = parseTerm();
    while (index < chars.length && (peek() === '+' || peek() === '-')) {
      const op = consume();
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  const result = parseExpression();
  if (index !== chars.length) {
    throw new Error('unexpected trailing input');
  }
  return result;
}
