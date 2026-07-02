export type HealthStateLevel = 'terrible' | 'poor' | 'ok' | 'good' | 'amazing';

export type HealthStateGridSlot =
  | 'top-left'
  | 'top-right'
  | 'mid-left'
  | 'center'
  | 'mid-right';

export interface HealthStateOption {
  level: HealthStateLevel;
  emoji: string;
  label: string;
  slot: HealthStateGridSlot;
}

/** Five-point wellness scale laid out with OK in the centre, Amazing top-right, Terrible on the left. */
export const HEALTH_STATE_OPTIONS: HealthStateOption[] = [
  { level: 'poor', emoji: '😕', label: 'Not great', slot: 'top-left' },
  { level: 'amazing', emoji: '🤩', label: 'Amazing', slot: 'top-right' },
  { level: 'terrible', emoji: '😢', label: 'Terrible', slot: 'mid-left' },
  { level: 'ok', emoji: '😐', label: 'OK', slot: 'center' },
  { level: 'good', emoji: '🙂', label: 'Good', slot: 'mid-right' },
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

export function healthStateSlotClass(slot: HealthStateGridSlot): string {
  return `health-state-picker__option--${slot}`;
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
