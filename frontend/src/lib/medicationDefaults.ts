import type { DoseFraction, MedFrequency, PillShape } from '../api/medications';

export const defaultFormulationPickerValue: {
  tabletStrengthMg: string;
  pillShape: PillShape;
  doseFraction: DoseFraction;
} = {
  tabletStrengthMg: '5',
  pillShape: 'round',
  doseFraction: 'half',
};

export const defaultMedFrequency: MedFrequency = {
  morning: 1,
  midday: 0,
  evening: 0,
  every: 1,
  unit: 'days',
};
