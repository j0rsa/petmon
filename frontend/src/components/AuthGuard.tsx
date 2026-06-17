import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { fetchAuthInfo, getStoredToken, redirectToLogin, storeRedirectPath } from '../lib/auth';

type State = 'checking' | 'authenticated' | 'redirecting';

export function AuthGuard() {
  const [state, setState] = useState<State>('checking');

  useEffect(() => {
    if (getStoredToken()) {
      setState('authenticated');
      return;
    }

    fetchAuthInfo().then((info) => {
      if (info.mode === 'dev') {
        setState('authenticated');
      } else if (info.mode === 'oidc') {
        storeRedirectPath(window.location.pathname + window.location.search);
        setState('redirecting');
        redirectToLogin(info);
      } else {
        // unconfigured — let the app load and show whatever error state it has
        setState('authenticated');
      }
    }).catch(() => {
      setState('authenticated');
    });
  }, []);

  if (state === 'checking' || state === 'redirecting') {
    return null;
  }

  return <Outlet />;
}
