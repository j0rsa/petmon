import { useMemo, useState } from 'react';
import { useTime } from '../context/useTime';
import { civilTimeCandidates, instantOffset, instantToCivil } from '../lib/resourceTime';

/** Empty input allows the API's real-time timestamp; a nonempty input must resolve. */
export function useRecordTimestamp(civil: string, originalInstant?: string) {
  const { timeZone } = useTime();
  const candidates = useMemo(() => civilTimeCandidates(civil, timeZone), [civil, timeZone]);
  const [selection, setSelection] = useState({ key: '', instant: '' });
  const key = `${timeZone}|${civil}`;
  const unchanged = originalInstant && civil && instantToCivil(originalInstant, timeZone).slice(0, civil.length) === civil;
  const utc = unchanged ? originalInstant : candidates.length === 1 ? candidates[0]
    : selection.key === key && candidates.includes(selection.instant) ? selection.instant : undefined;
  const feedback = !civil || unchanged || candidates.length === 1 ? null : candidates.length === 0
    ? <p className="error-state" role="alert">This time does not exist in {timeZone}. Choose a different time.</p>
    : <label className="form-row">This time occurs twice in {timeZone}. Choose which occurrence.
      <select aria-label="Repeated time occurrence" value={utc ?? ''} onChange={(event) => setSelection({ key, instant: event.target.value })}>
        <option value="">Choose an occurrence</option>
        {candidates.map((instant, index) => <option key={instant} value={instant}>{index === 0 ? 'Earlier' : 'Later'} (UTC{instantOffset(instant, timeZone)})</option>)}
      </select>
    </label>;
  return { utc, valid: !civil || !!utc, feedback };
}
