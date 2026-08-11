import { authApi } from '../api/auth';
import {
  clearSignedOut,
  clearToken,
  fetchAuthInfo,
  getStoredToken,
  markSignedOut,
  redirectToLogin,
} from './auth';
import { unsubscribePushNotifications } from './pushNotifications';

const PUSH_CLEANUP_TIMEOUT_MS = 2000;

/** End the current session without blocking on service-worker push cleanup. */
export async function performSignOut(kind: 'oidc' | 'api_token' | 'dev'): Promise<void> {
  const token = getStoredToken();
  markSignedOut();

  if (kind === 'api_token') {
    try {
      await authApi.signOut();
    } catch {
      // Still clear local storage even if the server call fails.
    }
  }

  clearToken();

  void Promise.race([
    unsubscribePushNotifications(),
    new Promise<void>((resolve) => {
      setTimeout(resolve, PUSH_CLEANUP_TIMEOUT_MS);
    }),
  ]).catch(() => {});

  if (kind === 'oidc' && token) {
    try {
      const authInfo = await fetchAuthInfo();
      if (authInfo.end_session_endpoint && authInfo.client_id) {
        const url = new URL(authInfo.end_session_endpoint);
        url.searchParams.set('client_id', authInfo.client_id);
        url.searchParams.set('post_logout_redirect_uri', `${window.location.origin}/`);
        url.searchParams.set('id_token_hint', token);
        window.location.assign(url.toString());
        return;
      }
    } catch {
      // Fall through to local signed-out landing.
    }
  }

  window.location.assign('/');
}

/** Start OIDC login after an explicit signed-out state. */
export async function signInFromSignedOut(): Promise<void> {
  clearSignedOut();
  const authInfo = await fetchAuthInfo();
  if (authInfo.mode === 'oidc') {
    await redirectToLogin(authInfo);
  } else {
    window.location.assign('/');
  }
}
