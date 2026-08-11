import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import {
  fetchAuthInfo,
  getStoredToken,
  isSignedOut,
  redirectToLogin,
  storeRedirectPath,
} from '../lib/auth';
import { signInFromSignedOut } from '../lib/signOut';

type State = 'checking' | 'authenticated' | 'redirecting' | 'offline' | 'signed-out';

export function AuthGuard() {
  const [state, setState] = useState<State>(() => {
    if (getStoredToken()) return 'authenticated';
    if (!navigator.onLine) return 'offline';
    if (isSignedOut()) return 'signed-out';
    return 'checking';
  });
  const ran = useRef(false);

  // Reset the ran ref whenever we return to 'checking' so the auth effect
  // can re-run (e.g. after coming back online from the 'offline' state).
  useEffect(() => {
    if (state === 'checking') {
      ran.current = false;
    }
  }, [state]);

  useEffect(() => {
    if (state !== 'checking') return;
    if (ran.current) return;
    ran.current = true;

    fetchAuthInfo().then((info) => {
      if (info.mode === 'oidc') {
        storeRedirectPath(window.location.pathname + window.location.search);
        setState('redirecting');
        redirectToLogin(info);
      } else {
        setState('authenticated');
      }
    }).catch(() => {
      // Network failure fetching auth info — treat as offline rather than
      // accidentally letting the user through unauthenticated.
      setState('offline');
    });
  }, [state]);

  useEffect(() => {
    if (state !== 'offline') return;
    const handler = () => setState('checking');
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }, [state]);

  if (state === 'checking' || state === 'redirecting') {
    return (
      <div className="loading-state" role="status" aria-live="polite">
        {state === 'redirecting' ? 'Redirecting to sign-in…' : 'Loading…'}
      </div>
    );
  }

  if (state === 'offline') {
    return (
      <div className="loading-state" role="status" aria-live="polite">
        No connection — waiting to sign in…
      </div>
    );
  }

  if (state === 'signed-out') {
    return (
      <div className="loading-state signed-out-state" role="status" aria-live="polite">
        <p>Signed out.</p>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => { void signInFromSignedOut(); }}
        >
          Sign in
        </button>
      </div>
    );
  }

  return <Outlet />;
}
