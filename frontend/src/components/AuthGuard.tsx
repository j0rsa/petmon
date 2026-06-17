import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { fetchAuthInfo, getStoredToken, redirectToLogin, storeRedirectPath } from '../lib/auth';

type State = 'checking' | 'authenticated' | 'redirecting';

export function AuthGuard() {
  const [state, setState] = useState<State>(() =>
    getStoredToken() ? 'authenticated' : 'checking'
  );

  useEffect(() => {
    if (state !== 'checking') return;

    fetchAuthInfo().then((info) => {
      if (info.mode === 'oidc') {
        storeRedirectPath(window.location.pathname + window.location.search);
        setState('redirecting');
        redirectToLogin(info);
      } else {
        setState('authenticated');
      }
    }).catch(() => {
      setState('authenticated');
    });
  }, [state]);

  if (state === 'checking' || state === 'redirecting') {
    return null;
  }

  return <Outlet />;
}
