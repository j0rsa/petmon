import { useContext } from 'react';
import { DisplaySettingsContext } from './DisplaySettingsContext.ts';

export function useDisplaySettings() {
  return useContext(DisplaySettingsContext);
}

export function useFormatTime() {
  const { time_format } = useDisplaySettings();
  return (iso: string) => {
    const hhmm = iso.slice(11, 16);
    if (time_format === 'h12') {
      const [hStr, mStr] = hhmm.split(':');
      const h = parseInt(hStr, 10);
      const suffix = h >= 12 ? 'pm' : 'am';
      const h12 = h % 12 === 0 ? 12 : h % 12;
      return `${h12}:${mStr} ${suffix}`;
    }
    return hhmm;
  };
}

export function useFormatDate() {
  const { date_format } = useDisplaySettings();
  return (date: string, style: 'long' | 'short' = 'long') => {
    if (date_format === 'mmm_dd_yyyy') {
      const options: Intl.DateTimeFormatOptions =
        style === 'long'
          ? { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
          : { month: 'short', day: 'numeric', year: 'numeric' };
      return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', options);
    }
    const [y, m, d] = date.split('-');
    if (style === 'short') return `${d}.${m}.${y}`;
    const dayName = new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
    return `${dayName}, ${d}.${m}.${y}`;
  };
}
