/** Least-squares linear regression over (index, value) pairs. Returns y-values at each index. */
export function linReg(
  values: (number | null)[],
  options?: { min?: number; max?: number },
): number[] | null {
  const pts = values
    .map((y, x) => (y != null ? { x, y } : null))
    .filter((p): p is { x: number; y: number } => p !== null);
  const n = pts.length;
  if (n < 2) return null;
  const sumX = pts.reduce((s, p) => s + p.x, 0);
  const sumY = pts.reduce((s, p) => s + p.y, 0);
  const sumXY = pts.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = pts.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return values.map((_, i) => {
    let y = parseFloat((intercept + slope * i).toFixed(2));
    if (options?.min != null) y = Math.max(options.min, y);
    if (options?.max != null) y = Math.min(options.max, y);
    return y;
  });
}
