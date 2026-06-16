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

// ── Pillar icons ──────────────────────────────────────────────────────────────

// Nutrition
export function BowlIcon() {
  return (
    <svg {...PROPS}>
      <path d="M4 10h16" />
      <path d="M4 10c0 5 3.1 8 8 8s8-3 8-8" />
      <line x1="9" y1="18" x2="15" y2="18" />
    </svg>
  );
}

export function ForkKnifeIcon() {
  return (
    <svg {...PROPS}>
      <line x1="8" y1="2" x2="8" y2="10" />
      <path d="M6 2v3a2 2 0 0 0 4 0V2" />
      <line x1="8" y1="12" x2="8" y2="22" />
      <line x1="16" y1="2" x2="16" y2="22" />
    </svg>
  );
}

export function AppleIcon() {
  return (
    <svg {...PROPS}>
      <path d="M12 20.94c1.5 0 4-1.5 4-8.94a4 4 0 0 0-4-4 4 4 0 0 0-4 4c0 7.44 2.5 8.94 4 8.94z" />
      <path d="M10 2c0 1.5.5 2.5 2 3" />
    </svg>
  );
}

// Toileting / Elimination
export function PawIcon() {
  return (
    <svg {...PROPS}>
      <circle cx="11" cy="4" r="2" />
      <circle cx="18" cy="8" r="2" />
      <circle cx="20" cy="16" r="2" />
      <path d="M9 10C7.5 10 3 13.4 3 17c0 2.8 2 4 4 4h10c2 0 4-1.2 4-4 0-3.6-4.5-7-6-7-1 0-2 .8-3 .8S10 10 9 10z" />
    </svg>
  );
}

export function DropletsIcon() {
  return (
    <svg {...PROPS}>
      <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
      <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />
    </svg>
  );
}

export function MoonIcon() {
  return (
    <svg {...PROPS}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// Health
export function HeartPulseIcon() {
  return (
    <svg {...PROPS}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      <polyline points="7.5 12 10 9 12 14 14 11 16.5 12" />
    </svg>
  );
}

export function StethoscopeIcon() {
  return (
    <svg {...PROPS}>
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  );
}

export function PillIcon() {
  return (
    <svg {...PROPS}>
      <path d="M10.5 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2.5" />
      <path d="m15 15 6 6" />
      <path d="m15 21 6-6" />
    </svg>
  );
}
