import { useApplicationExtensions } from './ApplicationExtensions';
import { useContext } from 'react';
import { InstanceTimezoneContext } from './InstanceTimezoneContext';
import { useOptionalSelectedPet } from './SelectedPetContext';
import { instantToCivil, resourceDateTime } from '../lib/resourceTime';

/** Explicit IDs support direct resource links; omission uses the selected pet.
 * Standalone uses the loaded instance timezone. Embedders supply ready IANA zones. */
export function useResourceTime(petId?: string | null) {
  const extensions = useApplicationExtensions();
  const selected = useOptionalSelectedPet();
  const instanceTimezone = useContext(InstanceTimezoneContext);
  const id = petId === undefined ? selected?.selectedPet?.id : petId;
  const configuredTimezone = (id ? extensions?.timezone?.(id) : undefined) ?? instanceTimezone;
  if (!configuredTimezone && id) throw new Error('A resource timezone must be configured before rendering care controls.');
  // With no active resource, dates are placeholders for loading/no-pet screens.
  // Real standalone pages are gated by InstanceTimezoneBoundary; embedders must
  // resolve a timezone for each resource before mounting its care controls.
  const timeZone = configuredTimezone ?? 'UTC';
  const clock = extensions?.now;
  const nowCivil = () => resourceDateTime(clock ? clock() : new Date(), timeZone);
  const civil = nowCivil();
  return {
    timeZone,
    toCivil: (instant: string) => instantToCivil(instant, timeZone),
    today: civil.slice(0, 10),
    nowTimeString: () => nowCivil().slice(11, 16),
    nowLocalDateTimeString: () => nowCivil().slice(0, 16),
    minuteOfDay: Number(civil.slice(11, 13)) * 60 + Number(civil.slice(14, 16)),
  };
}
