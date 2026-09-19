import { useApplicationExtensions } from './ApplicationExtensions';
import { useOptionalSelectedPet } from './SelectedPetContext';
import { resourceDateTime } from '../lib/resourceTime';

/** Explicit IDs support direct resource links; omission uses the selected pet.
 * Standalone keeps the browser's timezone. Embedders supply ready IANA zones. */
export function useResourceTime(petId?: string | null) {
  const extensions = useApplicationExtensions();
  const selected = useOptionalSelectedPet();
  const id = petId === undefined ? selected?.selectedPet?.id : petId;
  const timeZone = id ? extensions?.timezone?.(id) : undefined;
  const clock = extensions?.now;
  const nowCivil = () => resourceDateTime(clock ? clock() : new Date(), timeZone);
  const civil = nowCivil();
  return {
    today: civil.slice(0, 10),
    nowTimeString: () => nowCivil().slice(11, 16),
    nowLocalDateTimeString: () => nowCivil().slice(0, 16),
    minuteOfDay: Number(civil.slice(11, 13)) * 60 + Number(civil.slice(14, 16)),
  };
}
