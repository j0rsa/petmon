import { useQuery } from '@tanstack/react-query';
import { infoApi } from '../api/info';

/** Compact version + git SHA line (mobile pet sheet notifications footer, desktop sidebar). */
export function AppVersionFooter({ className = '' }: { className?: string }) {
  const { data: info } = useQuery({
    queryKey: ['app-info'],
    queryFn: infoApi.get,
    staleTime: Infinity,
    retry: false,
  });

  if (!info) {
    return null;
  }

  return (
    <p className={`app-version-footer${className ? ` ${className}` : ''}`}>
      v{info.version} · {info.git_sha}
    </p>
  );
}
