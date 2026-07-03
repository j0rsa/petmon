export type HealthStateLevel = 'terrible' | 'poor' | 'ok' | 'good' | 'amazing';

export interface HealthStateOption {
  level: HealthStateLevel;
  emoji: string;
  label: string;
}

/** Five-point wellness scale in left-to-right order: Terrible → Amazing. */
export const HEALTH_STATE_OPTIONS: HealthStateOption[] = [
  { level: 'terrible', emoji: '😢', label: 'Terrible' },
  { level: 'poor', emoji: '😕', label: 'Not great' },
  { level: 'ok', emoji: '😐', label: 'OK' },
  { level: 'good', emoji: '🙂', label: 'Good' },
  { level: 'amazing', emoji: '🤩', label: 'Amazing' },
];

const optionByLevel = Object.fromEntries(
  HEALTH_STATE_OPTIONS.map((option) => [option.level, option]),
) as Record<HealthStateLevel, HealthStateOption>;

export function healthStateLabel(level: HealthStateLevel): string {
  return optionByLevel[level].label;
}

export function healthStateEmoji(level: HealthStateLevel): string {
  return optionByLevel[level].emoji;
}

export const HEALTH_STATE_LEVELS: HealthStateLevel[] = [
  'terrible',
  'poor',
  'ok',
  'good',
  'amazing',
];

export function compareHealthStateLevels(a: HealthStateLevel, b: HealthStateLevel): number {
  return HEALTH_STATE_LEVELS.indexOf(a) - HEALTH_STATE_LEVELS.indexOf(b);
}
