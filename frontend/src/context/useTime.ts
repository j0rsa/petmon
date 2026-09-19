import { useApplicationExtensions } from './ApplicationExtensions';
import { useContext } from 'react';
import { InstanceTimezoneContext } from './InstanceTimezoneContext';
import { instantToCivil, resourceDateTime } from '../lib/resourceTime';

/** One ready timezone for the current user/session, independent of pet selection.
 * Standalone uses the validated instance zone; embedded apps supply a user zone. */
export function useTime() {
  const extensions = useApplicationExtensions();
  const instanceTimezone = useContext(InstanceTimezoneContext);
  const timeZone = extensions ? extensions.timezone : instanceTimezone;
  if (!timeZone) throw new Error('A user/session timezone must be configured before rendering clock-dependent UI.');
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
