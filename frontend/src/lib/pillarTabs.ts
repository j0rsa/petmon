import { matchPath } from 'react-router-dom';

const DATE_PARAM = /^\d{4}-\d{2}-\d{2}$/;

/** Journal tab: pillar root or a dated journal URL (`/nutrition/2024-06-15`). */
export function isPillarJournalActive(pathname: string, basePath: string): boolean {
  if (matchPath({ path: basePath, end: true }, pathname) != null) {
    return true;
  }

  const dateMatch = matchPath({ path: `${basePath}/:date`, end: true }, pathname);
  const date = dateMatch?.params.date;
  return typeof date === 'string' && DATE_PARAM.test(date);
}

/** Non-journal pillar tabs (analytics, schedules, import, …). */
export function isPillarSubTabActive(pathname: string, tabPath: string): boolean {
  return matchPath({ path: tabPath, end: true }, pathname) != null;
}

export function isPillarTabActive(pathname: string, tabPath: string, journalBasePath: string): boolean {
  if (tabPath === journalBasePath) {
    return isPillarJournalActive(pathname, journalBasePath);
  }
  return isPillarSubTabActive(pathname, tabPath);
}
