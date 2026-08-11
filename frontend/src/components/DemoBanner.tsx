import { useQuery } from '@tanstack/react-query';
import { infoApi } from '../api/info';

/** Sticky banner when the server runs with DEMO_MODE (PR preview / demo hosts). */
export function DemoBanner() {
  const { data: info } = useQuery({
    queryKey: ['app-info'],
    queryFn: infoApi.get,
    staleTime: Infinity,
    retry: false,
  });

  if (!info?.demo_mode) {
    return null;
  }

  return (
    <div className="demo-banner" role="status">
      Demo environment — sample data only. Do not use for real pet records.
    </div>
  );
}
