/** Shared metric icon paths used in both NutritionDayPanel and AnalyticsPage. */

const PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: '1.5',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function LiquidsIcon() {
  return (
    <svg {...PROPS}>
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  );
}

export function WaterIcon() {
  return (
    <svg {...PROPS}>
      <path d="M6 3h12l-2 16H8L6 3z" />
      <line x1="6" y1="9" x2="18" y2="9" />
    </svg>
  );
}

export function WetFoodIcon() {
  return (
    <svg {...PROPS}>
      <path d="M4 10h16" />
      <path d="M4 10c0 5 3.1 8 8 8s8-3 8-8" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </svg>
  );
}

export function TotalFluidIcon() {
  return (
    <svg {...PROPS}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </svg>
  );
}

export function TrendUpIcon() {
  return (
    <svg {...PROPS}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}
