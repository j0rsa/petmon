/** Backend pillar id — matches API routes and `elimination_records`, etc. */
export type MonitoringPillar = 'nutrition' | 'elimination' | 'health';

export interface PillarDefinition {
  /** Stable id aligned with the backend (`elimination`, not user-facing copy). */
  id: MonitoringPillar;
  /** Caregiver-facing nav and page title. */
  label: string;
  description: string;
  route: string;
  available: boolean;
}

export const PILLARS: PillarDefinition[] = [
  {
    id: 'nutrition',
    label: 'Nutrition',
    description: 'Meals, water, treats, and feeding schedules',
    route: '/nutrition',
    available: true,
  },
  {
    id: 'elimination',
    label: 'Toileting',
    description: 'Litter-box visits, potty breaks, and daily patterns',
    route: '/elimination',
    available: false,
  },
  {
    id: 'health',
    label: 'Health',
    description: 'Weight, medication, and vet notes',
    route: '/health',
    available: false,
  },
];

export function pillarById(id: MonitoringPillar): PillarDefinition {
  const pillar = PILLARS.find((item) => item.id === id);
  if (!pillar) {
    throw new Error(`Unknown pillar: ${id}`);
  }
  return pillar;
}

export function allPillarLabelsList(): string {
  const labels = PILLARS.map((pillar) => pillar.label);
  if (labels.length <= 1) {
    return labels[0] ?? '';
  }
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

export function upcomingPillarLabels(): string {
  const labels = PILLARS.filter((pillar) => !pillar.available).map((pillar) => pillar.label.toLowerCase());
  if (labels.length === 0) {
    return '';
  }
  if (labels.length === 1) {
    return labels[0];
  }
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

export interface DayNutritionHighlight {
  recordCount: number;
  wetFood: number;
  water: number;
  liquids: number;
  dryFood: number;
}
